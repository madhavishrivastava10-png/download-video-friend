-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(COALESCE(NEW.email,''), '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- DESIGNS
CREATE TABLE public.designs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled design',
  layout_mode TEXT NOT NULL DEFAULT 'fixed',
  grid_rows INT NOT NULL DEFAULT 5,
  grid_cols INT NOT NULL DEFAULT 4,
  platforms TEXT[] NOT NULL DEFAULT ARRAY['all'],
  content_types TEXT[] NOT NULL DEFAULT ARRAY['all'],
  password_protected BOOLEAN NOT NULL DEFAULT false,
  share_password TEXT,
  show_bio BOOLEAN NOT NULL DEFAULT true,
  show_highlights BOOLEAN NOT NULL DEFAULT true,
  is_public BOOLEAN NOT NULL DEFAULT false,
  share_slug TEXT UNIQUE,
  thumbnail_url TEXT,
  template TEXT NOT NULL DEFAULT 'reel',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX designs_user_idx ON public.designs(user_id, updated_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.designs TO authenticated;
GRANT SELECT ON public.designs TO anon;
GRANT ALL ON public.designs TO service_role;
ALTER TABLE public.designs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own designs" ON public.designs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "public designs readable" ON public.designs FOR SELECT TO anon USING (is_public = true);

-- MEDIA ITEMS
CREATE TABLE public.media_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id UUID NOT NULL REFERENCES public.designs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  position INT NOT NULL DEFAULT 0,
  media_type TEXT NOT NULL DEFAULT 'video',
  platform TEXT NOT NULL DEFAULT 'upload',
  storage_path TEXT,
  media_url TEXT NOT NULL,
  source_url TEXT,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX media_design_idx ON public.media_items(design_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_items TO authenticated;
GRANT SELECT ON public.media_items TO anon;
GRANT ALL ON public.media_items TO service_role;
ALTER TABLE public.media_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own media" ON public.media_items FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "public media readable" ON public.media_items FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.designs d WHERE d.id = design_id AND d.is_public = true));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER designs_touch BEFORE UPDATE ON public.designs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();