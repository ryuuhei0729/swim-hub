-- スプリットタイムの距離に小数（例: 12.5m）を許容するため、integer → numeric(10,1) に変更
ALTER TABLE "public"."split_times"
  ALTER COLUMN "distance" TYPE numeric(10,1) USING distance::numeric(10,1);
