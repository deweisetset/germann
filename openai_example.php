<?php
// openai_example.php
// Simple proxy endpoint to generate one German example sentence + Indonesian translation
// Expects JSON POST: { "word": "Haus" }
header('Content-Type: application/json; charset=utf-8');

// --- Configuration / API key retrieval ---
// Prefer environment variable for security
$apiKey = getenv('OPENAI_API_KEY');
// Optionally load from a file one level above webroot (helpful during dev).
$keyFile = __DIR__ . '/../openai_key.txt';
if (!$apiKey && file_exists($keyFile)) {
    $k = trim(file_get_contents($keyFile));
    if ($k) $apiKey = $k;
}
// Additional dev-friendly fallback: check C:\openai_secrets\openai_key.txt
$secretsPath = 'C:\\openai_secrets\\openai_key.txt';
if (!$apiKey && file_exists($secretsPath)) {
    $k2 = trim(file_get_contents($secretsPath));
    if ($k2) $apiKey = $k2;
}

if (!$apiKey) {
    http_response_code(500);
    echo json_encode(['error' => 'missing_api_key', 'detail' => 'OPENAI_API_KEY not set in environment or ../openai_key.txt']);
    exit;
}

// Read body
$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input) || empty($input['word'])) {
    http_response_code(400);
    echo json_encode(['error' => 'missing_word']);
    exit;
}

$word = trim((string)$input['word']);
if ($word === '') {
    http_response_code(400);
    echo json_encode(['error' => 'empty_word']);
    exit;
}

// Basic rate-limiting: allow N requests per IP per WINDOW seconds
$rateFile = __DIR__ . '/ai_rate_limits.json';
$cacheFile = __DIR__ . '/ai_cache.json';
$clientIp = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$RATE_WINDOW = 60; // seconds
$RATE_LIMIT = 10; // requests per window

// load rate data
$rates = [];
if (file_exists($rateFile)) {
    $rjson = @file_get_contents($rateFile);
    $rates = $rjson ? json_decode($rjson, true) : [];
    if (!is_array($rates)) $rates = [];
}

$now = time();
$timestamps = isset($rates[$clientIp]) && is_array($rates[$clientIp]) ? $rates[$clientIp] : [];
$timestamps = array_filter($timestamps, function($t) use ($now, $RATE_WINDOW) { return ($now - $t) <= $RATE_WINDOW; });
if (count($timestamps) >= $RATE_LIMIT) {
    http_response_code(429);
    echo json_encode(['error' => 'rate_limited']);
    exit;
}

// record this request
$timestamps[] = $now;
$rates[$clientIp] = $timestamps;
file_put_contents($rateFile, json_encode($rates, JSON_PRETTY_PRINT));

// Load cache
$cache = [];
if (file_exists($cacheFile)) {
    $cj = @file_get_contents($cacheFile);
    $cache = $cj ? json_decode($cj, true) : [];
    if (!is_array($cache)) $cache = [];
}

$key = mb_strtolower($word);
if (isset($cache[$key]) && isset($cache[$key]['result'])) {
    echo json_encode(['from_cache' => true, 'result' => $cache[$key]['result']]);
    exit;
}

// Build prompt instructing model to output JSON with german and translation keys only.
$prompt = "Buat satu contoh kalimat singkat dalam bahasa Jerman yang menggunakan kata \"$word\".
\nBerikan juga terjemahan dalam bahasa Indonesia.
\nOutput hanya berupa JSON dengan dua properti: \"german\" dan \"translation\".
\Gunakan Zeitform: {Präsens / Perfekt}.
\gunakan 1 subject {ich, du, er/sie/es, wir, ihr, sie}.
\Pastikan konjugasi kata kerja sesuai dengan subjek.
\Jika menggunakan Perfekt, pilih auxiliary verb (haben/sein) yang tepat.
Contoh:\n{\n  \"german\": \"Das ist ein Beispiel.\",\n  \"translation\": \"Ini adalah contoh.\"\n}
\nJangan tambahan penjelasan lain.";

$postData = [
    'model' => 'gpt-3.5-turbo',
    'messages' => [
        ['role' => 'system', 'content' => 'Kamu asisten yang menulis satu kalimat Jerman singkat dan terjemahannya dalam Bahasa Indonesia.'],
        ['role' => 'user', 'content' => $prompt]
    ],
    'max_tokens' => 200,
    'temperature' => 0.5
];

$ch = curl_init('https://api.openai.com/v1/chat/completions');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: Bearer ' . $apiKey
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($postData));
$response = curl_exec($ch);
$err = curl_error($ch);
$httpStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($err) {
    http_response_code(500);
    echo json_encode(['error' => 'curl_error', 'detail' => $err]);
    exit;
}

$respJson = json_decode($response, true);
if (!is_array($respJson) || !isset($respJson['choices'][0]['message']['content'])) {
    http_response_code(500);
    echo json_encode(['error' => 'invalid_response', 'detail' => $respJson]);
    exit;
}

$text = trim($respJson['choices'][0]['message']['content']);

// Try to parse JSON from the model. If the model returned a JSON object, use it.
$parsed = json_decode($text, true);
if (!$parsed || !is_array($parsed) || (!isset($parsed['german']) && !isset($parsed['translation']))) {
    // fallback: try to extract first two lines as german and translation
    $lines = array_values(array_filter(array_map('trim', preg_split('/\r?\n/', $text))));
    $german = $lines[0] ?? $text;
    $translation = $lines[1] ?? '';
    $parsed = ['german' => $german, 'translation' => $translation];
}

// normalize
$result = [
    'german' => $parsed['german'] ?? '',
    'translation' => $parsed['translation'] ?? ''
];

// Save to cache
$cache[$key] = ['result' => $result, 'created_at' => $now];
file_put_contents($cacheFile, json_encode($cache, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

echo json_encode(['from_cache' => false, 'result' => $result]);

?>
