-- Daily Daily schema, additive for an empty application database.
-- user_id is a text subject identifier so an auth provider can be selected later.
-- Until server authentication is configured, the shipped app stores profiles locally.

CREATE TABLE IF NOT EXISTS user_profile (
  user_id text PRIMARY KEY, display_name text NOT NULL DEFAULT '', timezone text NOT NULL DEFAULT 'Asia/Seoul',
  day_boundary_minutes integer NOT NULL DEFAULT 0 CHECK (day_boundary_minutes BETWEEN 0 AND 240),
  avatar_id integer NOT NULL DEFAULT 0, title_id text NOT NULL DEFAULT 'chronicler', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_settings (
  user_id text PRIMARY KEY, bgm_enabled boolean NOT NULL DEFAULT true, bgm_volume real NOT NULL DEFAULT .25 CHECK (bgm_volume BETWEEN 0 AND 1),
  sfx_enabled boolean NOT NULL DEFAULT true, sfx_volume real NOT NULL DEFAULT .5 CHECK (sfx_volume BETWEEN 0 AND 1), skip_title boolean NOT NULL DEFAULT false,
  reduced_effects boolean NOT NULL DEFAULT false, timezone text NOT NULL DEFAULT 'Asia/Seoul'
);
CREATE TABLE IF NOT EXISTS activity_category (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text, key text NOT NULL, name text NOT NULL, icon text NOT NULL DEFAULT '✦', color text NOT NULL DEFAULT '#aaa9a2',
  group_key text NOT NULL DEFAULT 'life', trait_weights jsonb NOT NULL DEFAULT '{}'::jsonb, is_system boolean NOT NULL DEFAULT false, sort_order integer NOT NULL DEFAULT 0, archived boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS activity_category_system_key_uq ON activity_category(key) WHERE user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS activity_category_user_key_uq ON activity_category(user_id,key) WHERE user_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS activity_type (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text, category_id uuid NOT NULL REFERENCES activity_category(id), key text NOT NULL, name text NOT NULL, icon text,
  metric_schema_key text NOT NULL DEFAULT 'duration', trait_weights jsonb, tags jsonb NOT NULL DEFAULT '[]'::jsonb, is_system boolean NOT NULL DEFAULT false, archived boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS activity_type_category_idx ON activity_type(category_id);
CREATE UNIQUE INDEX IF NOT EXISTS activity_type_user_category_key_uq ON activity_type(user_id,category_id,key) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS activity_type_system_category_key_uq ON activity_type(category_id,key) WHERE user_id IS NULL;
CREATE TABLE IF NOT EXISTS user_favorite (
  user_id text NOT NULL, kind text NOT NULL CHECK(kind IN ('subject','project','book','menu','activity_type')), value text NOT NULL, use_count integer NOT NULL DEFAULT 1 CHECK(use_count>0), last_used_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,kind,value)
);
CREATE TABLE IF NOT EXISTS user_pin (
  user_id text NOT NULL, category_id uuid NOT NULL REFERENCES activity_category(id), position integer NOT NULL CHECK(position>=0), PRIMARY KEY(user_id,category_id), UNIQUE(user_id,position)
);
CREATE TABLE IF NOT EXISTS activity_log (
  id uuid PRIMARY KEY, user_id text NOT NULL, category_id uuid NOT NULL REFERENCES activity_category(id), activity_type_id uuid REFERENCES activity_type(id),
  status text NOT NULL DEFAULT 'completed' CHECK(status IN ('in_progress','completed')), started_at timestamptz NOT NULL, ended_at timestamptz,
  duration_min integer NOT NULL DEFAULT 0 CHECK(duration_min>=0), attributed_date date NOT NULL, mood integer CHECK(mood BETWEEN 1 AND 5), details jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text NOT NULL DEFAULT '', source text NOT NULL DEFAULT 'detailed' CHECK(source IN ('quick','detailed','timer')), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK(version>0), CHECK(ended_at IS NULL OR ended_at>=started_at)
);
CREATE INDEX IF NOT EXISTS activity_log_user_date_idx ON activity_log(user_id,attributed_date);
CREATE INDEX IF NOT EXISTS activity_log_user_status_idx ON activity_log(user_id,status);
CREATE TABLE IF NOT EXISTS daily_settlement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL, date date NOT NULL, revision integer NOT NULL CHECK(revision>0), status text NOT NULL DEFAULT 'final' CHECK(status IN ('final','superseded')),
  hero_type_no integer NOT NULL CHECK(hero_type_no BETWEEN 1 AND 100), features jsonb NOT NULL, reasons jsonb NOT NULL, narrative text[] NOT NULL DEFAULT '{}', rule_version text NOT NULL DEFAULT '1.0.0',
  input_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,date,revision)
);
CREATE UNIQUE INDEX IF NOT EXISTS daily_settlement_final_uq ON daily_settlement(user_id,date) WHERE status='final';
CREATE TABLE IF NOT EXISTS hero_collection (
  user_id text NOT NULL, hero_type_no integer NOT NULL CHECK(hero_type_no BETWEEN 1 AND 100), first_obtained_date date NOT NULL, count integer NOT NULL DEFAULT 1 CHECK(count>0), PRIMARY KEY(user_id,hero_type_no)
);
CREATE TABLE IF NOT EXISTS event_occurrence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL, event_id text NOT NULL, date date NOT NULL, trigger_log_id uuid REFERENCES activity_log(id), chain_id text, chain_step integer,
  seen_at timestamptz, data jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,event_id,date)
);
CREATE TABLE IF NOT EXISTS reward_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL, source_type text NOT NULL CHECK(source_type IN ('event','settlement','achievement','quest','log_xp')), source_key text NOT NULL,
  xp jsonb NOT NULL DEFAULT '{}'::jsonb, items jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,source_type,source_key)
);
CREATE TABLE IF NOT EXISTS inventory (
  user_id text NOT NULL, item_id text NOT NULL, quantity integer NOT NULL DEFAULT 0 CHECK(quantity>=0), first_obtained_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,item_id)
);
CREATE TABLE IF NOT EXISTS achievement (
  user_id text NOT NULL, achievement_id text NOT NULL, unlocked_at timestamptz NOT NULL DEFAULT now(), date date NOT NULL, PRIMARY KEY(user_id,achievement_id)
);
CREATE TABLE IF NOT EXISTS quest_progress (
  user_id text NOT NULL, chain_id text NOT NULL, step integer NOT NULL DEFAULT 0 CHECK(step>=0), state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','done','expired')),
  started_date date NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), data jsonb NOT NULL DEFAULT '{}'::jsonb, PRIMARY KEY(user_id,chain_id)
);
CREATE TABLE IF NOT EXISTS region_unlock (
  user_id text NOT NULL, region_id text NOT NULL, unlocked_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,region_id)
);
CREATE TABLE IF NOT EXISTS settlement_job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL, date date NOT NULL, reason text NOT NULL CHECK(reason IN ('midnight','edit','late_entry','manual')),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','done','failed')), attempts integer NOT NULL DEFAULT 0, run_after timestamptz NOT NULL DEFAULT now(), locked_until timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS settlement_job_open_user_date_uq ON settlement_job(user_id,date) WHERE status IN ('pending','running');
CREATE INDEX IF NOT EXISTS settlement_job_ready_idx ON settlement_job(status,run_after);
CREATE TABLE IF NOT EXISTS trait_progress (
  user_id text NOT NULL, trait text NOT NULL CHECK(trait IN ('knowledge','strength','creativity','recovery','bond','calm')), xp integer NOT NULL DEFAULT 0 CHECK(xp>=0), level integer NOT NULL DEFAULT 1 CHECK(level BETWEEN 1 AND 99), PRIMARY KEY(user_id,trait)
);
CREATE TABLE IF NOT EXISTS daily_category_ordinal (
  user_id text NOT NULL, date date NOT NULL, category_key text NOT NULL, ordinal integer NOT NULL DEFAULT 0 CHECK(ordinal>=0), signatures jsonb NOT NULL DEFAULT '{}'::jsonb, PRIMARY KEY(user_id,date,category_key)
);

-- Idempotent system category seed. JSON weights retain the 70/30 trait allocation.
INSERT INTO activity_category(key,name,icon,color,group_key,trait_weights,is_system,sort_order) VALUES
 ('sleep','수면','☾','#7e8bd4','recovery','{"recovery":0.7,"calm":0.3}',true,1),
 ('meal','식사','✦','#d99b59','life','{"recovery":0.7,"bond":0.3}',true,2),
 ('study','공부','⌘','#70b9b2','knowledge','{"knowledge":0.7,"calm":0.3}',true,3),
 ('development','개발','⚙','#b18bc9','craft','{"creativity":0.7,"knowledge":0.3}',true,4),
 ('exercise','운동','⚔','#d67d72','body','{"strength":0.7,"calm":0.3}',true,5),
 ('meditation','명상','❋','#7ebbb4','mind','{"calm":0.7,"recovery":0.3}',true,6),
 ('rest','휴식','❧','#82a97d','recovery','{"recovery":0.7,"calm":0.3}',true,7),
 ('reading','독서','▤','#b99a6d','knowledge','{"knowledge":0.7,"creativity":0.3}',true,8),
 ('creation','창작','✎','#ce8eaa','craft','{"creativity":0.7,"calm":0.3}',true,9),
 ('leisure','여가','◇','#d2bc69','leisure','{"creativity":0.7,"recovery":0.3}',true,10),
 ('outing','외출','⌖','#91b87e','explore','{"strength":0.7,"creativity":0.3}',true,11),
 ('relationship','인연','♡','#d5ae55','social','{"bond":0.7,"recovery":0.3}',true,12),
 ('life','생활','⌂','#aaa9a2','life','{"calm":0.7,"strength":0.3}',true,13)
ON CONFLICT DO NOTHING;

WITH type_rows(category_key, entries) AS (VALUES
 ('sleep',ARRAY['밤잠','낮잠','쪽잠','선잠·밤샘 후']),('meal',ARRAY['아침','점심','저녁','간식','야식']),
 ('study',ARRAY['수학','영어','강의','독학','문제풀이','암기','복습','스터디']),('development',ARRAY['기능','버그','리팩터','설계','리뷰','배포','학습']),
 ('exercise',ARRAY['근력','걷기','달리기','자전거','수영','등산','스트레칭','요가','필라테스','축구','농구','배드민턴','테니스','클라이밍']),
 ('meditation',ARRAY['호흡','바디스캔','걷기명상','기도']),('rest',ARRAY['멍','산책','차 한잔','음악','낮잠 아님 휴식']),
 ('reading',ARRAY['읽기','완독']),('creation',ARRAY['글','그림','음악','영상','공예']),('leisure',ARRAY['게임','영상','음악감상','취미']),
 ('outing',ARRAY['산책','쇼핑','여행','카페','자연']),('relationship',ARRAY['가족','친구','연인','동료','반려동물']),('life',ARRAY['집안일','위생','정리','장보기'])
)
INSERT INTO activity_type(category_id,key,name,metric_schema_key,tags,is_system)
SELECT c.id, lower(encode(convert_to(e.name,'UTF8'),'hex')), e.name, 'duration', jsonb_build_array(c.group_key), true
FROM type_rows t CROSS JOIN LATERAL unnest(t.entries) AS e(name) JOIN activity_category c ON c.key=t.category_key AND c.user_id IS NULL
ON CONFLICT DO NOTHING;
