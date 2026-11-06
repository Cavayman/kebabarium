-- DEV ONLY sample data (never applied in production). Mirrors the mockup.
-- Every statement is idempotent and ends with ";" + newline (tests split on that).

INSERT OR IGNORE INTO chains (id, city_id, name, slug, norm_name) VALUES (1, 1, 'Кебаб-Шеф', 'kebab-shef', 'кебаб шеф');

INSERT OR IGNORE INTO places (id, city_id, name, norm_name, address, lat, lng, district, chain_id, status, dead_reason, moved_to_place_id, google_rating, google_rating_count) VALUES
 (1, 1, 'Шаурма на Коновальця', 'коновальця', 'вул. Коновальця, 52', 49.8295, 24.0205, 'Франківський', NULL, 'open', NULL, NULL, 4.7, 212),
 (2, 1, 'Doner біля Ринку', 'doner біля ринку', 'пл. Ринок, 14', 49.8418, 24.0318, 'Галицький', NULL, 'open', NULL, NULL, 4.7, 964),
 (3, 1, 'Кебаб-Шеф Сихів', 'кебаб шеф сихів', 'просп. Червоної Калини, 60', 49.7960, 24.0560, 'Сихівський', 1, 'open', NULL, NULL, 4.4, 388),
 (4, 1, 'Mafia Kebab', 'mafia', 'вул. Дорошенка, 31', 49.8395, 24.0120, 'Галицький', NULL, 'open', NULL, NULL, 4.2, 140),
 (5, 1, 'Шаурма біля Політеху', 'біля політеху', 'вул. Бандери, 12', 49.8352, 24.0150, 'Франківський', NULL, 'open', NULL, NULL, 4.2, 77),
 (6, 1, 'Будка на Городоцькій', 'будка на городоцькій', 'вул. Городоцька, 120', 49.8440, 23.9850, 'Залізничний', NULL, 'open', NULL, NULL, 2.4, 31),
 (7, 1, 'Шаурма Левандівка', 'левандівка', 'вул. Широка, 5', 49.8500, 23.9600, 'Залізничний', NULL, 'open', NULL, NULL, 4.0, 58),
 (8, 1, 'Кебаб-Шеф Личаківська', 'кебаб шеф личаківська', 'вул. Личаківська, 40', 49.8360, 24.0560, 'Личаківський', 1, 'open', NULL, NULL, 4.4, 203),
 (9, 1, 'Шаурма Рясне', 'рясне', 'вул. Шевченка, 300', 49.8730, 23.9450, 'Шевченківський', NULL, 'open', NULL, NULL, 3.4, 22),
 (10, 1, 'Doner Пасічна', 'doner пасічна', 'вул. Пасічна, 90', 49.8270, 24.0830, 'Личаківський', NULL, 'open', NULL, NULL, 3.9, 45),
 (11, 1, 'Шаурма на Наукової', 'наукової', 'вул. Наукова, 7', 49.8090, 24.0230, 'Франківський', NULL, 'open', NULL, NULL, NULL, NULL),
 (12, 1, 'Шаурма на Патона', 'патона', 'вул. Патона, 3', 49.8270, 23.9930, 'Залізничний', NULL, 'dead', 'moved', 1, 4.6, 301),
 (13, 1, 'Шаурма «Тест»', 'тест', 'вул. Тестова, 1', 49.8410, 24.0000, 'Галицький', NULL, 'open', NULL, NULL, NULL, NULL);

INSERT OR IGNORE INTO users (id, google_sub, email, nickname, nickname_lc, first_name, last_name, role) VALUES
 (1, 'dev-sub-1', 'oleg@example.com', 'oleg', 'oleg', 'Oleg', 'K', 'user'),
 (2, 'dev-sub-2', 'marta@example.com', 'marta_k', 'marta_k', 'Marta', 'K', 'user'),
 (3, 'dev-sub-3', 'lev@example.com', 'lev_doner', 'lev_doner', 'Lev', 'D', 'user'),
 (4, 'dev-sub-4', 'hunter@example.com', 'shaurma_hunter', 'shaurma_hunter', 'Ivan', 'H', 'user'),
 (5, 'dev-sub-5', 'sasha@example.com', 'sasha', 'sasha', 'Sasha', 'S', 'user');

-- Logged-in ratings (weight 1). Combined targets: 1→4.8, 2→4.6, 3→4.5, 5→3.9, 6→2.1, 8→4.3, 10→3.7, 11→4.4.
INSERT OR IGNORE INTO ratings (id, place_id, user_id, stars, text, is_anonymous, weight, status, created_at) VALUES
 (1, 1, 1, 5, 'ті самі, що на Патона. лаваш як треба', 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-12 minutes')),
 (2, 1, 2, 5, 'мʼясо соковите', 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 hours')),
 (3, 1, 3, 5, NULL, 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days')),
 (4, 1, 4, 5, 'топ-1 у місті', 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days')),
 (5, 1, 5, 4, 'довго чекали, але варто', 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')),
 (6, 2, 1, 5, NULL, 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 hours')),
 (7, 2, 2, 4, 'багато соусу, мало мʼяса', 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hours')),
 (8, 2, 3, 5, NULL, 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days')),
 (9, 2, 4, 4, NULL, 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-4 days')),
 (10, 3, 1, 5, NULL, 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-6 hours')),
 (11, 3, 2, 5, 'о 2 ночі рятує. респект', 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 minutes')),
 (12, 3, 3, 4, NULL, 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days')),
 (13, 3, 4, 4, NULL, 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days')),
 (14, 3, 5, 5, NULL, 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 days')),
 (15, 5, 1, 4, 'студентська класика', 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days')),
 (16, 5, 2, 3, NULL, 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days')),
 (17, 5, 3, 4, NULL, 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days')),
 (18, 5, 4, 3, NULL, 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-4 days')),
 (19, 5, 5, 4, NULL, 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 days')),
 (20, 6, 1, 2, 'холодна і сумна', 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 hours')),
 (21, 6, 2, 2, NULL, 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days')),
 (22, 6, 3, 1, NULL, 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days')),
 (23, 6, 4, 2, NULL, 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-4 days')),
 (24, 6, 5, 2, NULL, 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 days')),
 (25, 8, 1, 4, 'як завжди стабільно', 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-8 hours')),
 (26, 8, 2, 4, NULL, 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days')),
 (27, 8, 3, 5, NULL, 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days')),
 (28, 8, 4, 4, NULL, 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-4 days')),
 (29, 8, 5, 4, NULL, 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 days')),
 (30, 10, 1, 4, NULL, 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days')),
 (31, 10, 2, 3, NULL, 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days')),
 (32, 10, 3, 4, NULL, 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days')),
 (33, 10, 4, 3, NULL, 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-4 days')),
 (34, 11, 1, 5, 'новинка, дуже свіжо', 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-40 minutes')),
 (35, 11, 2, 4, NULL, 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days')),
 (36, 11, 3, 5, NULL, 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days')),
 (37, 11, 4, 4, NULL, 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-4 days')),
 (38, 11, 5, 4, NULL, 0, 1, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 days'));

-- Anonymous ratings (weight 0.5) for place 1: our = (24 + 0.5*5*2) / 6 = 4.833 -> combined with 4.7 = 4.77 -> 4.8.
INSERT OR IGNORE INTO ratings (id, place_id, nickname, stars, text, is_anonymous, weight, status, ip_hash, ip_prefix_hash, device_id, created_at) VALUES
 (39, 1, NULL, 5, NULL, 1, 0.5, 'published', 'seed-ip-1', 'seed-pfx-1', 'seed-dev-1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-6 days')),
 (40, 1, 'гість', 5, 'лаваш свіжий', 1, 0.5, 'published', 'seed-ip-2', 'seed-pfx-2', 'seed-dev-2', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-6 days'));

INSERT OR IGNORE INTO external_reviews (id, city_id, place_id, source, external_id, author, text, stars, url, published_at) VALUES
 (1, 1, 2, 'google', 'seed-g-1', 'Andriy P.', 'найкраща в районі, але черга', 4, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-50 minutes')),
 (2, 1, 6, 'google', 'seed-g-2', 'Iryna', 'холодна і сумна', 2, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-4 hours')),
 (3, 1, 8, 'google', 'seed-g-3', 'Taras', 'стабільно смачно, як завжди', 5, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-9 hours')),
 (4, 1, NULL, 'threads', 'seed-t-1', '@lviv_foodie', 'хто знає нормальну шаурму на сихові??', NULL, 'https://www.threads.net/@lviv_foodie', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 hours')),
 (5, 1, 1, 'threads', 'seed-t-2', '@shaurma_hunter', 'топ-3 львова: коновальця, ринок, сихів. спорьте', NULL, 'https://www.threads.net/@shaurma_hunter', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-20 hours'));
