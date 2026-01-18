-- handle_new_user トリガー関数を更新して、birthday を raw_user_meta_data から取得するように修正

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public
    AS $$
BEGIN
  INSERT INTO public.users (id, name, gender, birthday, profile_image_path, bio)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'gender')::INTEGER, 0), -- デフォルト: 0 (male)
    CASE 
      WHEN NEW.raw_user_meta_data->>'birthday' IS NOT NULL AND NEW.raw_user_meta_data->>'birthday' != '' 
      THEN (NEW.raw_user_meta_data->>'birthday')::DATE
      ELSE NULL
    END,
    NULL, -- プロフィール画像は後でアップロード
    NULL
  );
  RETURN NEW;
END;
$$;
