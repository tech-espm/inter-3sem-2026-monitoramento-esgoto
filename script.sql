CREATE DATABASE IF NOT EXISTS monitoramentoesgoto DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE monitoramentoesgoto;

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
