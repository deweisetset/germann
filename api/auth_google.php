<?php
// Server endpoint to accept an access token from client, verify with Google,
// and insert/update user record in local DB. Returns JSON { user: {...} }

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/db.php';

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!$data || empty($data['access_token'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing access_token']);
    exit;
}

$access_token = $data['access_token'];

// Verify token with Google
$verifyUrl = 'https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=' . urlencode($access_token);
$resp = @file_get_contents($verifyUrl);
if ($resp === false) {
    http_response_code(400);
    echo json_encode(['error' => 'Failed to verify token with Google']);
    exit;
}

$tokenInfo = json_decode($resp, true);
if (!$tokenInfo || empty($tokenInfo['sub'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid token']);
    exit;
}

$googleId = $tokenInfo['sub'];
$email = isset($tokenInfo['email']) ? $tokenInfo['email'] : null;
$name = isset($tokenInfo['name']) ? $tokenInfo['name'] : null;
$picture = isset($tokenInfo['picture']) ? $tokenInfo['picture'] : null;

// Function to generate random display name
function generateDisplayName() {
    $animals = ['kucing', 'panda', 'ular'];
    $randomAnimal = $animals[array_rand($animals)];
    $randomNumber = str_pad(random_int(0, 9999), 4, '0', STR_PAD_LEFT);
    return $randomAnimal . '#' . $randomNumber;
}

// Upsert user
try {
    $stmt = $pdo->prepare('SELECT id, display_name, total_score FROM users WHERE google_id = :gid');
    $stmt->execute(['gid' => $googleId]);
    $user = $stmt->fetch();
    if ($user) {
        $userId = $user['id'];
        $displayName = $user['display_name'];
        $totalScore = $user['total_score'];
        $up = $pdo->prepare('UPDATE users SET email = :email, name = :name, picture = :picture WHERE id = :id');
        $up->execute(['email' => $email, 'name' => $name, 'picture' => $picture, 'id' => $userId]);
    } else {
        // Generate display name for new user
        $displayName = generateDisplayName();
        $totalScore = 0;
        $ins = $pdo->prepare('INSERT INTO users (google_id, email, name, picture, display_name, total_score) VALUES (:gid, :email, :name, :picture, :display_name, :total_score)');
        $ins->execute(['gid' => $googleId, 'email' => $email, 'name' => $name, 'picture' => $picture, 'display_name' => $displayName, 'total_score' => $totalScore]);
        $userId = $pdo->lastInsertId();
    }

    // return user info with display_name and total_score
    echo json_encode(['user' => ['id' => (int)$userId, 'google_id' => $googleId, 'email' => $email, 'name' => $name, 'picture' => $picture, 'display_name' => $displayName, 'total_score' => (int)$totalScore]]);
    exit;
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error', 'detail' => $e->getMessage()]);
    exit;
}

?>

