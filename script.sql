CREATE DATABASE IF NOT EXISTS monitoramentoesgoto DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_0900_ai_ci;

-- Todos os deltas estão em segundos

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
  KEY odor_data_id_sensor (data, id_sensor),
  KEY odor_id_sensor (id_sensor)
);

-- Query de consolidação por dia da semana (1 = domingo, 2 = segunda...) e por hora, para o heatmap com 7 colunas e 24 linhas
select dayofweek(data) dia_semana, extract(hour from data) hora, max(h2s) h2s, max(umidade) umidade, max(nh3) nh3, max(temperatura) temperatura
from odor
where data between '2025-03-03 00:00:00' and '2025-03-14 23:59:59'
and id_sensor = 2
group by dia_semana, hora;

-- Query de consolidação por dia do mês e por hora, para o heatmap de visão explodida por dia do mês com N colunas e 24 linhas
select date_format(date(data), '%d/%m/%Y') dia, extract(hour from data) hora, max(h2s) h2s, max(umidade) umidade, max(nh3) nh3, max(temperatura) temperatura
from odor
where data between '2025-03-03 00:00:00' and '2025-03-14 23:59:59'
and id_sensor = 2
group by dia, hora;

-- Query de consolidação por dia do mês, para o gráfico por dia do mês
select date_format(date(data), '%d/%m/%Y') dia, max(h2s) h2s, max(umidade) umidade, max(nh3) nh3, max(temperatura) temperatura
from odor
where data between '2025-03-03 00:00:00' and '2025-03-14 23:59:59'
and id_sensor = 2
group by dia;
