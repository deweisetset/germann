<?php
// Endpoint to save score when player wins
// Expects: user_id, score, word, attempts
// Returns: updated user data with total_score

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/db.php';

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!$data || empty($data['user_id']) || !isset($data['score'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing user_id or score']);
    exit;
}

$userId = (int)$data['user_id'];
$score = (int)$data['score'];
$word = isset($data['word']) ? $data['word'] : null;
$attempts = isset($data['attempts']) ? (int)$data['attempts'] : null;

try {
    // Insert score record
    $ins = $pdo->prepare('INSERT INTO scores (user_id, word, attempts, result, points) VALUES (:user_id, :word, :attempts, :result, :points)');
    $ins->execute([
        'user_id' => $userId,
        'word' => $word,
        'attempts' => $attempts,
        'result' => 'win',
        'points' => $score
    ]);

    // Update total_score in users table
    $upd = $pdo->prepare('UPDATE users SET total_score = total_score + :points WHERE id = :user_id');
    $upd->execute(['points' => $score, 'user_id' => $userId]);

    // Get updated user data
    $stmt = $pdo->prepare('SELECT id, google_id, email, name, picture, display_name, total_score FROM users WHERE id = :id');
    $stmt->execute(['id' => $userId]);
    $user = $stmt->fetch();

    if ($user) {
        echo json_encode(['success' => true, 'user' => $user]);
        exit;
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to fetch updated user']);
        exit;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error', 'detail' => $e->getMessage()]);
    exit;
}

?>
