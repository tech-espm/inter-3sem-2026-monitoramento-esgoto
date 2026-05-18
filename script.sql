CREATE DATABASE IF NOT EXISTS monitoramentoesgoto DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_0900_ai_ci;

USE monitoramentoesgoto;

-- Sensores cadastrados no sistema
CREATE TABLE IF NOT EXISTS sensor (
  id INT NOT NULL AUTO_INCREMENT,
  codigo VARCHAR(20) NOT NULL,
  nome VARCHAR(100) NOT NULL,
  tipo ENUM('odor', 'nivel', 'pressao') NOT NULL DEFAULT 'odor',
  localizacao VARCHAR(150) NOT NULL,
  nivel_critico DECIMAL(5,2) NOT NULL DEFAULT 80.00,
  h2s_critico DECIMAL(6,3) NOT NULL DEFAULT 0.050,
  nh3_critico DECIMAL(6,3) NOT NULL DEFAULT 0.030,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY sensor_codigo (codigo)
);

-- Leituras de odor (API ESPM / LoRaWAN)
CREATE TABLE IF NOT EXISTS odor (
  id BIGINT NOT NULL AUTO_INCREMENT,
  data DATETIME NOT NULL,
  id_sensor TINYINT NOT NULL,
  delta INT NOT NULL,
  bateria TINYINT NOT NULL,
  h2s FLOAT NOT NULL,
  umidade FLOAT NOT NULL,
  nh3 FLOAT NOT NULL,
  temperatura FLOAT NOT NULL,
  PRIMARY KEY (id),
  KEY odor_data_id_sensor (data, id_sensor),
  KEY odor_id_sensor (id_sensor)
);

-- Níveis de esgoto (percentual, vazão, pressão)
CREATE TABLE IF NOT EXISTS nivel_esgoto (
  id BIGINT NOT NULL AUTO_INCREMENT,
  id_sensor INT NOT NULL,
  data DATETIME NOT NULL,
  nivel_percentual DECIMAL(5,2) NOT NULL,
  vazao DECIMAL(8,2) NULL,
  pressao DECIMAL(6,3) NULL,
  PRIMARY KEY (id),
  KEY nivel_esgoto_sensor_data (id_sensor, data),
  CONSTRAINT fk_nivel_sensor FOREIGN KEY (id_sensor) REFERENCES sensor (id) ON DELETE CASCADE
);

-- Alertas gerados automaticamente ou manualmente
CREATE TABLE IF NOT EXISTS alerta (
  id BIGINT NOT NULL AUTO_INCREMENT,
  id_sensor INT NOT NULL,
  tipo VARCHAR(50) NOT NULL,
  mensagem VARCHAR(255) NOT NULL,
  severidade ENUM('baixa', 'media', 'alta', 'critica') NOT NULL DEFAULT 'media',
  data DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolvido TINYINT(1) NOT NULL DEFAULT 0,
  resolvido_em DATETIME NULL,
  PRIMARY KEY (id),
  KEY alerta_sensor (id_sensor),
  KEY alerta_resolvido (resolvido, data),
  CONSTRAINT fk_alerta_sensor FOREIGN KEY (id_sensor) REFERENCES sensor (id) ON DELETE CASCADE
);

INSERT INTO sensor (codigo, nome, tipo, localizacao, nivel_critico, h2s_critico, nh3_critico, ativo) VALUES
('odor01', 'Sensor Odor 01', 'odor', 'Poço de visita A - Zona Norte', 85.00, 0.050, 0.030, 1),
('odor02', 'Sensor Odor 02', 'odor', 'Estação elevatória B', 85.00, 0.050, 0.030, 1),
('nivel01', 'Sensor Nível 01', 'nivel', 'Coletor principal - Trecho 3', 80.00, 0.050, 0.030, 1),
('press01', 'Sensor Pressão 01', 'pressao', 'Tubulação forçada - Ramal 2', 75.00, 0.050, 0.030, 1)
ON DUPLICATE KEY UPDATE nome = VALUES(nome);

INSERT INTO nivel_esgoto (id_sensor, data, nivel_percentual, vazao, pressao) VALUES
(3, DATE_SUB(NOW(), INTERVAL 6 HOUR), 42.50, 12.30, 1.120),
(3, DATE_SUB(NOW(), INTERVAL 5 HOUR), 48.20, 13.10, 1.180),
(3, DATE_SUB(NOW(), INTERVAL 4 HOUR), 55.80, 14.50, 1.250),
(3, DATE_SUB(NOW(), INTERVAL 3 HOUR), 62.40, 15.20, 1.310),
(3, DATE_SUB(NOW(), INTERVAL 2 HOUR), 71.30, 16.80, 1.420),
(3, DATE_SUB(NOW(), INTERVAL 1 HOUR), 78.90, 17.50, 1.480),
(3, NOW(), 83.20, 18.10, 1.520),
(4, DATE_SUB(NOW(), INTERVAL 3 HOUR), NULL, NULL, 1.050),
(4, DATE_SUB(NOW(), INTERVAL 2 HOUR), NULL, NULL, 1.180),
(4, DATE_SUB(NOW(), INTERVAL 1 HOUR), NULL, NULL, 1.320),
(4, NOW(), NULL, NULL, 1.410)
ON DUPLICATE KEY UPDATE nivel_percentual = nivel_percentual;

INSERT INTO alerta (id_sensor, tipo, mensagem, severidade, data, resolvido) VALUES
(1, 'h2s_elevado', 'Concentração de H₂S acima do limite em odor01', 'alta', DATE_SUB(NOW(), INTERVAL 2 HOUR), 0),
(3, 'nivel_critico', 'Nível de esgoto próximo ao limite crítico (83,2%)', 'media', DATE_SUB(NOW(), INTERVAL 30 MINUTE), 0),
(4, 'pressao_anomala', 'Pressão da tubulação com variação anômala', 'baixa', DATE_SUB(NOW(), INTERVAL 1 DAY), 1)
ON DUPLICATE KEY UPDATE mensagem = VALUES(mensagem);
