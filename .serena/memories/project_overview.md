# Swim Manager v2 - プロジェクト概要

## プロジェクトの目的
水泳選手管理システム（個人利用版）
- 水泳選手の練習記録、競技記録を効率的に管理
- ダッシュボード、カレンダー機能、記録分析機能を提供
- Webアプリケーション（Next.js）とモバイルアプリ（Flutter）のモノレポ構成

## 技術スタック
- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL), GraphQL
- **Mobile**: Flutter, Dart
- **Deployment**: Vercel
- **Monorepo**: npm workspaces
- **Database**: PostgreSQL (Supabase)
- **Authentication**: Supabase Auth

## アーキテクチャ
- モノレポ構成 (apps/web, apps/mobile, supabase/)
- GraphQL Edge Functions for API
- Apollo Client for state management
- Row Level Security (RLS) for data security