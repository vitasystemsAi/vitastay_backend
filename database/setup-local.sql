-- Run once as MySQL root to create the Nivas database and app user
-- Windows: & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p < database\setup-local.sql

CREATE DATABASE IF NOT EXISTS nivas_hostel CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'nivas_user'@'localhost' IDENTIFIED BY 'nivas_pass';
GRANT ALL PRIVILEGES ON nivas_hostel.* TO 'nivas_user'@'localhost';

FLUSH PRIVILEGES;

SELECT 'Database and user ready. Use DB_USER=nivas_user DB_PASSWORD=nivas_pass in .env' AS status;
