<?php
header('Content-Type: application/json');

// Terima data JSON dari request
$json_data = file_get_contents('php://input');
$data = json_decode($json_data, true);

if ($data === null) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON data']);
    exit;
}

// Path ke file data.json
$file_path = 'data.json';

// Tulis data ke file
if (file_put_contents($file_path, json_encode($data, JSON_PRETTY_PRINT))) {
    echo json_encode(['success' => true, 'message' => 'Data saved successfully']);
} else {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to save data']);
}
?>