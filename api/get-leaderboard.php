<?php
// Get top 10 players by total_score
// Returns: array of users with ranking

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/db.php';

try {
    $stmt = $pdo->prepare('
        SELECT id, display_name, total_score 
        FROM users 
        WHERE total_score > 0
        ORDER BY total_score DESC 
        LIMIT 10
    ');
    $stmt->execute();
    $leaderboard = $stmt->fetchAll();

    // Add ranking
    $result = [];
    foreach ($leaderboard as $index => $player) {
        $player['rank'] = $index + 1;
        $result[] = $player;
    }

    echo json_encode(['success' => true, 'leaderboard' => $result]);
    exit;
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error', 'detail' => $e->getMessage()]);
    exit;
}

?>
