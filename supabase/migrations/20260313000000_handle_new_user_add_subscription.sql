-- handle_new_user トリガー関数を更新して、user_subscriptions にフリープランのレコードを自動作成する

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public
    AS $$
BEGIN
  INSERT INTO public.users (id, name, gender, birthday, profile_image_path, bio)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'gender')::INTEGER, 0),
    CASE
      WHEN NEW.raw_user_meta_data->>'birthday' IS NOT NULL AND NEW.raw_user_meta_data->>'birthday' != ''
      THEN (NEW.raw_user_meta_data->>'birthday')::DATE
      ELSE NULL
    END,
    NULL,
    NULL
  );

  -- フリープランのサブスクリプションレコードを作成
  INSERT INTO public.user_subscriptions (id, plan)
  VALUES (NEW.id, 'free');

  RETURN NEW;
END;
$$;

-- 既存ユーザーで user_subscriptions にレコードがない場合のバックフィル
INSERT INTO public.user_subscriptions (id, plan)
SELECT u.id, 'free'
FROM public.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_subscriptions us WHERE us.id = u.id
);
