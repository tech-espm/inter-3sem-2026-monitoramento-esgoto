CREATE DATABASE IF NOT EXISTS monitoramentoesgoto DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE monitoramentoesgoto;

-- topic v3/espm/devices/odor01/up
-- topic v3/espm/devices/odor02/up
-- { "end_device_ids": { "device_id": "odor01" }, "uplink_message": { "rx_metadata": [{ "timestamp": 2040934975 }], "decoded_payload": { "battery": 99, "h2s": 0.02, "humidity": 78, "nh3": 0.01, "temperature": 24.3 } } }
CREATE TABLE odor (
  id bigint NOT NULL AUTO_INCREMENT,
  data datetime NOT NULL,
  id_sensor tinyint NOT NULL,
  delta int NOT NULL,
  bateria tinyint NOT NULL,
  h2s float NOT NULL,
  umidade float NOT NULL,
  nh3 float NOT NULL,
  temperatura float NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY sensor_codigo (codigo)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS odor (
  id BIGINT NOT NULL,
  data DATETIME NOT NULL,
  id_sensor TINYINT NOT NULL,
  delta INT NOT NULL DEFAULT 0,
  bateria TINYINT NOT NULL DEFAULT 100,
  h2s FLOAT NOT NULL DEFAULT 0,
  umidade FLOAT NOT NULL DEFAULT 0,
  nh3 FLOAT NOT NULL DEFAULT 0,
  temperatura FLOAT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY odor_data_id_sensor (data, id_sensor)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS nivel_esgoto (
  id BIGINT NOT NULL AUTO_INCREMENT,
  id_sensor INT NOT NULL,
  data DATETIME NOT NULL,
  nivel_percentual DECIMAL(5,2) NULL,
  vazao DECIMAL(8,2) NULL,
  pressao DECIMAL(6,3) NULL,
  PRIMARY KEY (id),
  KEY nivel_esgoto_sensor_data (id_sensor, data),
  CONSTRAINT fk_nivel_sensor FOREIGN KEY (id_sensor) REFERENCES sensor (id) ON DELETE CASCADE
) ENGINE=InnoDB;

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
  CONSTRAINT fk_alerta_sensor FOREIGN KEY (id_sensor) REFERENCES sensor (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Dados iniciais (opcional — o app também cria na primeira execução)
INSERT IGNORE INTO sensor (id, codigo, nome, tipo, localizacao, nivel_critico, h2s_critico, nh3_critico, ativo) VALUES
(1, 'odor01', 'Sensor Odor 01', 'odor', 'Poço de visita A', 85, 0.05, 0.03, 1),
(2, 'odor02', 'Sensor Odor 02', 'odor', 'Estação elevatória B', 85, 0.05, 0.03, 1),
(3, 'nivel01', 'Sensor Nível 01', 'nivel', 'Coletor principal', 80, 0.05, 0.03, 1),
(4, 'press01', 'Sensor Pressão 01', 'pressao', 'Tubulação ramal 2', 75, 0.05, 0.03, 1);
