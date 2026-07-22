CREATE TABLE public.species (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  species TEXT NOT NULL UNIQUE,
  element element_type NOT NULL,
  position_role TEXT NOT NULL CHECK (position_role IN ('GOL','DEF','MEI','ATA')),
  position_label TEXT NOT NULL,
  is_goalkeeper BOOLEAN NOT NULL DEFAULT false,
  origin TEXT NOT NULL,
  power_key TEXT NOT NULL UNIQUE,
  power_name TEXT NOT NULL,
  power_desc TEXT NOT NULL,
  base_defender INT NOT NULL DEFAULT 0,
  base_passar INT NOT NULL DEFAULT 0,
  base_atacar INT NOT NULL DEFAULT 0,
  base_tecnica INT NOT NULL DEFAULT 0,
  base_forca INT NOT NULL DEFAULT 0,
  base_pique INT NOT NULL DEFAULT 0,
  base_maos INT NOT NULL DEFAULT 0,
  base_concentracao INT NOT NULL DEFAULT 0,
  base_elasticidade INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.species TO anon, authenticated;
GRANT ALL ON public.species TO service_role;
ALTER TABLE public.species ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Species readable by everyone" ON public.species FOR SELECT USING (true);

CREATE TABLE public.epithets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  element element_type NOT NULL,
  epithet TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (element, epithet)
);
GRANT SELECT ON public.epithets TO anon, authenticated;
GRANT ALL ON public.epithets TO service_role;
ALTER TABLE public.epithets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Epithets readable by everyone" ON public.epithets FOR SELECT USING (true);

INSERT INTO public.species (species, element, position_role, position_label, is_goalkeeper, origin, power_key, power_name, power_desc, base_defender, base_passar, base_atacar, base_tecnica, base_forca, base_pique, base_maos, base_concentracao, base_elasticidade) VALUES
('Fênix','fogo','ATA','Atacante',false,'Grega/Egípcia','renascer','Renascer','Se sair lesionada, volta com energia cheia na próxima partida.',22,45,74,62,38,70,0,0,0),
('Salamandra','fogo','MEI','Meio-campo',false,'Europeia','pele_brasa','Pele de Brasa','Reduz o desgaste de energia pela metade.',40,58,50,66,35,62,0,0,0),
('Ifrit','fogo','ATA','Atacante',false,'Árabe','explosao','Explosão','Chute com chance extra de gol de fora da área.',30,40,72,48,68,52,0,0,0),
('Quimera','fogo','ATA','Atacante',false,'Grega','tres_cabecas','Três Cabeças','Pode atuar em qualquer posição sem perder rendimento.',44,42,68,55,64,58,0,0,0),
('Boitatá','fogo','DEF','Zagueiro',false,'Brasileira','cerca_fogo','Cerca de Fogo','Aumenta a defesa do time inteiro quando está em campo.',70,44,25,48,60,55,0,0,0),
('Zhu Que','fogo','MEI','Meio-campo',false,'Chinesa','voo_sul','Voo do Sul','Melhora o passe longo em contra-ataques.',35,68,58,70,32,66,0,0,0),
('Surtur','fogo','DEF','Zagueiro',false,'Nórdica','espada_flamejante','Espada Flamejante','Vence disputas físicas com vantagem.',72,30,45,35,78,30,0,0,0),
('Mula-sem-Cabeça','fogo','MEI','Meio-campo',false,'Brasileira','galope','Galope','Dispara e ignora a marcação uma vez por jogo.',48,50,52,45,62,74,0,0,0),
('Drakon','fogo','DEF','Zagueiro',false,'Grega','sopro_ardente','Sopro Ardente','Intimida atacantes e reduz a chance de gol adversária.',68,38,48,42,72,40,0,0,0),
('Vouivre','fogo','ATA','Atacante',false,'Francesa','rubi_ardente','Rubi Ardente','Primeira finalização do jogo tem bônus de precisão.',28,52,66,68,40,64,0,0,0),
('Cérbero','fogo','GOL','Goleiro',true,'Grega','tres_guardas','Três Guardas','Defende com vantagem em lances seguidos.',0,0,0,0,0,0,72,68,45),
('Ládon','fogo','GOL','Goleiro',true,'Grega','vigilia_eterna','Vigília Eterna','Não perde concentração no fim do jogo.',0,0,0,0,0,0,62,74,50),
('Kraken','agua','DEF','Zagueiro',false,'Nórdica','tentaculos','Tentáculos','Desarma múltiplos adversários no mesmo lance.',76,32,30,38,74,28,0,0,0),
('Iara','agua','MEI','Meio-campo',false,'Brasileira','canto','Canto','Atrai a marcação e abre espaço para os companheiros.',34,72,55,74,28,58,0,0,0),
('Hidra','agua','DEF','Zagueiro',false,'Grega','regeneracao','Regeneração','Recupera energia sozinha durante a partida.',74,40,42,44,68,35,0,0,0),
('Leviatã','agua','DEF','Zagueiro',false,'Hebraica','abismo','Abismo','Bloqueia finalizações de longa distância.',78,30,38,32,76,25,0,0,0),
('Sereia','agua','MEI','Meio-campo',false,'Grega','melodia','Melodia','Melhora o passe de todo o time.',30,70,52,72,26,60,0,0,0),
('Kelpie','agua','MEI','Meio-campo',false,'Escocesa','correnteza','Correnteza','Arranca em velocidade pela lateral.',45,55,58,62,55,72,0,0,0),
('Tritão','agua','MEI','Meio-campo',false,'Grega','buzio_guerra','Búzio de Guerra','Eleva a moral do time após sofrer um gol.',52,66,55,60,58,54,0,0,0),
('Selkie','agua','ATA','Atacante',false,'Nórdica/Celta','pele_foca','Pele de Foca','Escapa da marcação com facilidade.',26,58,68,70,30,68,0,0,0),
('Ningyo','agua','ATA','Atacante',false,'Japonesa','sorte_mar','Sorte do Mar','Chance extra de gol em rebotes.',24,50,70,64,34,62,0,0,0),
('Cetus','agua','DEF','Zagueiro',false,'Grega','mare_alta','Maré Alta','Empurra a linha adversária para trás.',70,34,44,36,74,32,0,0,0),
('Caribde','agua','GOL','Goleiro',true,'Grega','redemoinho_gk','Redemoinho','Engole a bola e não dá rebote.',0,0,0,0,0,0,74,62,52),
('Bake-kujira','agua','GOL','Goleiro',true,'Japonesa','nevoa','Névoa','Confunde o atacante em bolas cruzadas.',0,0,0,0,0,0,66,70,55),
('Golem','terra','DEF','Zagueiro',false,'Judaica','muralha','Muralha','Praticamente não é ultrapassado em disputas.',80,25,22,28,78,20,0,0,0),
('Minotauro','terra','DEF','Zagueiro',false,'Grega','investida','Investida','Atropela a marcação em jogadas de força.',72,35,48,40,76,42,0,0,0),
('Curupira','terra','MEI','Meio-campo',false,'Brasileira','pes_virados','Pés Virados','Confunde totalmente quem tenta marcá-lo.',50,60,52,74,44,76,0,0,0),
('Ciclope','terra','DEF','Zagueiro',false,'Grega','martelo','Martelo','Cabeceio com força extra em bolas paradas.',74,28,45,30,80,30,0,0,0),
('Troll','terra','DEF','Zagueiro',false,'Nórdica','pele_pedra','Pele de Pedra','Resiste a faltas sem se machucar.',76,26,38,30,74,26,0,0,0),
('Dvergr','terra','MEI','Meio-campo',false,'Nórdica','forja','Forja','Melhora o rendimento dos companheiros a cada temporada.',62,62,44,58,60,40,0,0,0),
('Fomoriano','terra','DEF','Zagueiro',false,'Irlandesa','furia_antiga','Fúria Antiga','Cresce quando o time está perdendo.',70,32,52,38,78,34,0,0,0),
('Gnomo','terra','MEI','Meio-campo',false,'Europeia','toca_secreta','Toca Secreta','Enxerga passes que ninguém vê.',55,68,40,66,38,52,0,0,0),
('Saci','terra','MEI','Meio-campo',false,'Brasileira','redemoinho','Redemoinho','Drible imprevisível, quase impossível de prever.',42,64,55,78,32,74,0,0,0),
('Tarasca','terra','DEF','Zagueiro',false,'Francesa','carapaca','Carapaça','Reduz o dano de qualquer investida adversária.',78,28,40,32,76,24,0,0,0),
('Talos','terra','GOL','Goleiro',true,'Grega','bronze_vivo','Bronze Vivo','Corpo fechado em finalizações rasteiras.',0,0,0,0,0,0,76,70,38),
('Humbaba','terra','GOL','Goleiro',true,'Mesopotâmica','guardiao','Guardião','Nunca falha em bolas dentro da pequena área.',0,0,0,0,0,0,70,74,42),
('Grifo','ar','ATA','Atacante',false,'Grega/Persa','rasante','Rasante','Ataque aéreo devastador.',40,52,72,60,58,78,0,0,0),
('Pégaso','ar','MEI','Meio-campo',false,'Grega','voo_livre','Voo Livre','Cobre todo o campo sem se cansar.',38,70,58,72,42,80,0,0,0),
('Harpia','ar','ATA','Atacante',false,'Grega','rapina','Rapina','Rouba a bola do zagueiro e sai em disparada.',30,48,70,62,40,76,0,0,0),
('Roc','ar','DEF','Zagueiro',false,'Árabe','sombra_gigante','Sombra Gigante','Domina completamente o jogo aéreo.',68,36,52,40,74,58,0,0,0),
('Thunderbird','ar','ATA','Atacante',false,'Norte-americana','trovao','Trovão','Finalização com potência absurda.',34,50,74,58,62,72,0,0,0),
('Sílfide','ar','MEI','Meio-campo',false,'Alquímica','brisa','Brisa','Passes precisos que cortam a defesa.',32,74,48,76,24,70,0,0,0),
('Garuda','ar','ATA','Atacante',false,'Indiana','asas_douradas','Asas Douradas','Desequilibra em jogadas rápidas.',42,56,70,64,60,74,0,0,0),
('Quetzalcóatl','ar','MEI','Meio-campo',false,'Asteca','serpente_emplumada','Serpente Emplumada','Comanda o meio-campo inteiro.',46,76,60,74,44,66,0,0,0),
('Anzu','ar','MEI','Meio-campo',false,'Mesopotâmica','tempestade','Tempestade','Melhora o time em partidas com chuva ou vento.',50,62,55,60,56,68,0,0,0),
('Simurgh','ar','ATA','Atacante',false,'Persa','renovacao','Renovação','Recupera a energia dos companheiros no intervalo.',36,60,68,70,46,70,0,0,0),
('Argos','ar','GOL','Goleiro',true,'Grega','cem_olhos','Cem Olhos','Enxerga o lance antes de acontecer.',0,0,0,0,0,0,62,80,58),
('Alicanto','ar','GOL','Goleiro',true,'Chilena','voo_cintilante','Voo Cintilante','Defesas espetaculares no ângulo.',0,0,0,0,0,0,58,66,76),
('Jötun','gelo','DEF','Zagueiro',false,'Nórdica','gigante_gelo','Gigante do Gelo','Congela o avanço adversário.',78,28,42,32,78,26,0,0,0),
('Wendigo','gelo','ATA','Atacante',false,'Algonquina','fome_insaciavel','Fome Insaciável','Quanto mais gols marca, mais forte fica.',38,40,72,52,70,66,0,0,0),
('Yeti','gelo','DEF','Zagueiro',false,'Himalaia','avalanche','Avalanche','Derruba qualquer atacante na dividida.',74,30,46,34,76,38,0,0,0),
('Draugr','gelo','DEF','Zagueiro',false,'Nórdica','morto_vivo','Morto-vivo','Não se cansa nunca durante a partida.',72,34,44,40,68,32,0,0,0),
('Ymir','gelo','DEF','Zagueiro',false,'Nórdica','ancestral','Ancestral','O zagueiro mais imponente do bestiário.',80,26,38,28,80,22,0,0,0),
('Amarok','gelo','MEI','Meio-campo',false,'Inuit','lobo_solitario','Lobo Solitário','Melhora muito quando o time está com um a menos.',58,52,58,55,66,72,0,0,0),
('Qiqirn','gelo','MEI','Meio-campo',false,'Inuit','passo_silencioso','Passo Silencioso','Some da marcação e reaparece livre.',52,60,50,62,48,74,0,0,0),
('Tizheruk','gelo','MEI','Meio-campo',false,'Inuit','bote_gelado','Bote Gelado','Intercepta passes com facilidade.',56,64,52,58,58,62,0,0,0),
('Jack Frost','gelo','MEI','Meio-campo',false,'Inglesa','geada','Geada','Deixa o campo escorregadio para o adversário.',40,68,55,74,30,68,0,0,0),
('Skoll','gelo','ATA','Atacante',false,'Nórdica','cacada','Caçada','Persegue e alcança qualquer defensor.',34,46,70,56,64,76,0,0,0),
('Fafnir','gelo','GOL','Goleiro',true,'Nórdica','guardiao_tesouro','Guardião do Tesouro','Não deixa passar nada rasteiro.',0,0,0,0,0,0,78,66,44),
('Nix','gelo','GOL','Goleiro',true,'Germânica','reflexo_gelido','Reflexo Gélido','Reação instantânea em chutes de perto.',0,0,0,0,0,0,64,62,74);

INSERT INTO public.epithets (element, epithet) VALUES
('fogo','Escarlate'),('fogo','Rubro'),('fogo','das Brasas'),('fogo','do Crepúsculo'),('fogo','Incandescente'),('fogo','Flamejante'),('fogo','do Vulcão'),('fogo','das Cinzas'),('fogo','Ardente'),('fogo','da Fornalha'),('fogo','Carmesim'),('fogo','Solar'),('fogo','do Estio'),('fogo','de Enxofre'),('fogo','da Pira'),('fogo','Fulgente'),('fogo','do Braseiro'),('fogo','Coruscante'),('fogo','da Lava'),('fogo','do Ocaso'),
('agua','Abissal'),('agua','das Profundezas'),('agua','da Maré'),('agua','Turquesa'),('agua','das Correntes'),('agua','do Recife'),('agua','Salino'),('agua','Cristalino'),('agua','do Estuário'),('agua','das Ondas'),('agua','do Golfo'),('agua','da Enseada'),('agua','Nauta'),('agua','da Foz'),('agua','das Marés Vivas'),('agua','do Arrecife'),('agua','Pluvial'),('agua','da Nascente'),('agua','Sereno'),('agua','do Dilúvio'),
('terra','de Basalto'),('terra','Rúnico'),('terra','Ancestral'),('terra','de Granito'),('terra','das Cavernas'),('terra','Musgoso'),('terra','da Mata Fechada'),('terra','de Ferro'),('terra','das Raízes'),('terra','Pétreo'),('terra','do Vale'),('terra','Ocre'),('terra','das Montanhas'),('terra','Milenar'),('terra','de Argila'),('terra','do Barranco'),('terra','Telúrico'),('terra','da Gruta'),('terra','de Quartzo'),('terra','do Sertão'),
('ar','Célere'),('ar','das Alturas'),('ar','do Vendaval'),('ar','Prateado'),('ar','das Nuvens'),('ar','Errante'),('ar','do Zênite'),('ar','Sussurrante'),('ar','da Ventania'),('ar','Etéreo'),('ar','do Horizonte'),('ar','Alado'),('ar','da Brisa'),('ar','do Cume'),('ar','Nefelino'),('ar','do Sopro'),('ar','Volante'),('ar','da Rajada'),('ar','Aéreo'),('ar','do Firmamento'),
('gelo','Glacial'),('gelo','do Norte'),('gelo','das Geleiras'),('gelo','Invernal'),('gelo','Congelado'),('gelo','da Tundra'),('gelo','Boreal'),('gelo','de Cristal'),('gelo','Silencioso'),('gelo','das Neves'),('gelo','Gélido'),('gelo','do Solstício'),('gelo','Alvo'),('gelo','da Nevasca'),('gelo','do Permafrost'),('gelo','Hibernal'),('gelo','de Quartzo Azul'),('gelo','do Degelo'),('gelo','Frígido'),('gelo','da Aurora');