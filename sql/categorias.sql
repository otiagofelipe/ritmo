/* ══════════════════════════════════════════════════════════════
   RITMO · Tradução das categorias da Pluggy (com emoji)

   Uma linha por categoria que a Pluggy manda (em inglês), com o nome
   em português e um emoji. A gold faz Left Join por nm_category_source
   e usa nm_category_display no lugar da category original. Categoria
   nova que aparecer e não estiver aqui continua passando em inglês
   (o Coalesce do join), até ganhar uma linha.
   ══════════════════════════════════════════════════════════════ */

Create Or Replace View silver.ritmo.vw_category_map As
Select
    nm_category_source,
    nm_category,
    ds_emoji,
    Concat(ds_emoji, ' ', nm_category) As nm_category_display
From Values
    ('Groceries',                    'Mercado',                      '🛒'),
    ('Food and drinks',              'Alimentação e bebidas',        '🍽️'),
    ('Eating out',                   'Restaurantes',                 '🍴'),
    ('Food delivery',                'Delivery',                     '🛵'),
    ('Digital services',             'Serviços digitais',            '💻'),
    ('Services',                     'Serviços',                     '🛠️'),
    ('Shopping',                     'Compras',                      '🛍️'),
    ('Online shopping',              'Compras online',               '📦'),
    ('Clothing',                     'Roupas',                       '👕'),
    ('Electronics',                  'Eletrônicos',                  '🔌'),
    ('Houseware',                    'Casa e decoração',             '🛋️'),
    ('Bookstore',                    'Livraria',                     '📚'),
    ('Sports goods',                 'Artigos esportivos',           '⚽'),
    ('Leisure',                      'Lazer',                        '🎉'),
    ('Cinema, theater and concerts', 'Cinema, teatro e shows',       '🎬'),
    ('Tickets',                      'Ingressos',                    '🎟️'),
    ('Landmarks and museums',        'Museus e pontos turísticos',   '🏛️'),
    ('Gaming',                       'Games',                        '🎮'),
    ('Gambling',                     'Apostas',                      '🎰'),
    ('Lottery',                      'Loteria',                      '🍀'),
    ('Travel',                       'Viagem',                       '✈️'),
    ('Accomodation',                 'Hospedagem',                   '🏨'),
    ('Transportation',               'Transporte',                   '🚌'),
    ('Public transportation',        'Transporte público',           '🚇'),
    ('Taxi and ride-hailing',        'Táxi e apps de corrida',       '🚕'),
    ('Car rental',                   'Aluguel de carro',             '🚙'),
    ('Automotive',                   'Automotivo',                   '🚗'),
    ('Gas stations',                 'Combustível',                  '⛽'),
    ('Parking',                      'Estacionamento',               '🅿️'),
    ('Tolls and in vehicle payment', 'Pedágio e tag',                '🛣️'),
    ('Vehicle maintenance',          'Manutenção do carro',          '🔧'),
    ('Housing',                      'Moradia',                      '🏠'),
    ('Rent',                         'Aluguel',                      '🔑'),
    ('Electricity',                  'Energia',                      '💡'),
    ('Water',                        'Água',                         '💧'),
    ('Internet',                     'Internet',                     '🌐'),
    ('Telecommunications',           'Telefonia',                    '📱'),
    ('Healthcare',                   'Saúde',                        '⚕️'),
    ('Health insurance',             'Plano de saúde',               '🩺'),
    ('Hospital clinics and labs',    'Hospitais, clínicas e exames', '🏥'),
    ('Pharmacy',                     'Farmácia',                     '💊'),
    ('Optometry',                    'Ótica',                        '👓'),
    ('Wellness and fitness',         'Bem-estar e academia',         '🏋️'),
    ('Insurance',                    'Seguros',                      '🛡️'),
    ('Credit card fees',             'Tarifas do cartão',            '💳'),
    ('Tax on financial operations',  'IOF',                          '🧾'),
    ('Donations',                    'Doações',                      '💝'),
    ('Transfers',                    'Transferências',               '🔁'),
    ('Transfer - PIX',               'Pix',                          '⚡'),
    ('Third party transfer - PIX',   'Pix para terceiros',           '💸'),
    ('Transfer - Foreign Exchange',  'Câmbio',                       '💱'),
    ('__null__',                     'Sem categoria',                '❔')
As t(nm_category_source, nm_category, ds_emoji);

Comment On Column silver.ritmo.vw_category_map.nm_category_source  Is 'Categoria como a Pluggy manda (inglês). __null__ representa a categoria vazia.';
Comment On Column silver.ritmo.vw_category_map.nm_category         Is 'Categoria em português.';
Comment On Column silver.ritmo.vw_category_map.ds_emoji            Is 'Emoji da categoria.';
Comment On Column silver.ritmo.vw_category_map.nm_category_display Is 'Emoji + nome em português, como aparece na página.';


/* ─── Como usar na gold (trecho para o Select da vw_ritmo) ─── */
-- From ... t
-- Left Join silver.ritmo.vw_category_map m
--     On m.nm_category_source = Coalesce(t.category, '__null__')
-- Select ..., Coalesce(m.nm_category_display, t.category) As category, ...


/* ─── Conferência: categorias da gold que ainda não têm tradução ─── */
Select Distinct g.category
From gold.prod.vw_ritmo g
Left Join silver.ritmo.vw_category_map m
    On m.nm_category_source = Coalesce(g.category, '__null__')
Where m.nm_category_source Is Null
  -- depois de trocar a gold, a category já vem traduzida: essas não contam
  And Coalesce(g.category, '') Not In (Select nm_category_display From silver.ritmo.vw_category_map);
