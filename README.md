# Mood — Minimal Mood Tracker (Web / PWA & Android AppWidget)

**Mood** は、日々の気分・体感・天候・アクティビティ・写真・ひとことメモを **1枚のボトムシートで数秒で記録** できるミニマルなムードトラッカーアプリです。

落ち着いたアース／くすみトーンの **キーカラー ＋ アウトラインアイコン** で統一し、視覚的なノイズを極限まで抑えたタイムラインと「Pixels（カレンダーヒストリー）」で日々の状態変化を静かに振り返ることができます。

---

## ✨ 主な機能

- **⚡ 1シート完結・開閉式のクイック入力 (`QuickEntrySheet`)**
  - シートを開いた初期状態では「5段階のムード」と保存ボタンのみがコンパクトに表示され、ムードだけなら **1タップで即座に記録完了**。
  - 「体感（暑い・寒い・空腹・疲れた・眠い等）」「天候」「していること（アクティビティ）」「メモ・画像」は開閉式アコーディオンになっており、必要な項目だけを開いて任意入力可能。閉じた状態でも選択済みのアイコンがキーカラーでプレビュー表示されます。
- **🌿 つながる縦タイムライン & Pixels ヒストリー (`LogTimeline`)**
  - **Timeline ビュー**：日付ごとに左側の縦スパイン（軸）とムードのキーカラーノードがつながる落ち着いたタイムライン表示。添付写真はタップでライトボックス拡大表示。
  - **Pixels ビュー**：直近28日間のムード推移を色のマス目で俯瞰できるカレンダーグリッドとムード割合バー。
- **📱 Android ネイティブ ホーム画面ウィジェット（2種同梱）**
  - **`Mood Photo`（2×2 リサイズ対応）**：直近の写真付きログを背景に表示し、左上にムードカラー＆日時バッジ、右下に1シート記録を即起動する **`[＋]` クイック追加ボタン** を備えたフォトウィジェット。
  - **`Mood`（4×1 バー）**：5段階のムードアイコンが並び、タップしたムードが選択された状態で1シート記録を即起動するミニマルバーウィジェット。
  - **Nothing OS / Android 13+ テーマアイコン対応**：ベクターアダプティブアイコンに加え、`<monochrome>` レイヤーにも対応。
- **🔔 リマインダー通知 & バックアップ / Moodistory インポート / 日次フォルダ同期**
  - 複数の時刻を指定できるリマインダー通知設定。
  - 完全ローカル保存（IndexedDB + Android `SharedPreferences` ブリッジ）でオフライン動作。
  - Android SAF（Storage Access Framework）で指定フォルダへ `index.json` / `daily/YYYY-MM-DD.json` / `images/` を自動出力し、Syncthing や FolderSync 経由で外部連携・日次同期に対応。
  - JSON 形式でのバックアップ書き出し・読み込みに加え、**Moodistory のエクスポートデータ（CSV / JSON）のインポート** に対応。

---

## 🛠️ 技術スタック

- **フロントエンド**: React 18 + TypeScript + Vite + Tailwind CSS + Lucide Icons
- **ローカルストレージ**: IndexedDB + LocalStorage + Android `JavascriptInterface` ブリッジ
- **Android ネイティブ層**: Kotlin (`MainActivity`, `PhotoMoodWidgetProvider`, `QuickMoodWidgetProvider`, Adaptive Icon XML)

---

## 🚀 セットアップ・開発方法

### 1. Web / PWA として起動

```bash
npm install
npm run dev
```

本番用ビルドを作成する場合：

```bash
npm run build
```

### 2. Android ネイティブ APK のビルドと実機インストール

Android SDK（`platforms/android-35`, `build-tools/35.0.0`）および Android Studio（同梱の JBR / Kotlin コンパイラ）がインストールされている環境で、以下のスクリプトを実行すると `MoodTracker-debug.apk` が生成されます。

```bash
npm run build
cp -R dist/* android/app/src/main/assets/www/
./build-apk.sh
```

USBデバッグ有効化済みの Android 端末へインストールする場合：

```bash
adb install -r MoodTracker-debug.apk
```

---

## 📂 ディレクトリ構成

```text
├── android/                  # Android ネイティブプロジェクト & AppWidget 実装
│   └── app/src/main/
│       ├── AndroidManifest.xml
│       ├── java/com/minimal/moodtracker/
│       │   ├── MainActivity.kt             # WebView ホスト & ウィジェット同期ブリッジ
│       │   ├── DailySyncManager.kt         # SAF 経由の日次 JSON & 画像フォルダ自動出力
│       │   ├── PhotoMoodWidgetProvider.kt  # 2×2 フォト＋クイック追加ウィジェット
│       │   └── QuickMoodWidgetProvider.kt  # 4×1 5段階ムードバーウィジェット
│       └── res/                            # ウィジェットレイアウト・アダプティブアイコン定義
├── public/                   # PWA マニフェスト & アプリアイコン
├── src/
│   ├── components/
│   │   ├── LogTimeline.tsx         # 縦タイムライン & Pixels カレンダービュー
│   │   ├── QuickEntrySheet.tsx     # 1シート開閉式クイック記録シート
│   │   ├── WidgetBarSimulator.tsx  # アプリ内 2×2 フォトウィジェットプレビュー
│   │   ├── SettingsModal.tsx       # リマインダー設定 & CSV/JSON インポート/エクスポート
│   │   └── MinimalIcon.tsx         # アウトラインアイコン共通コンポーネント
│   ├── constants/
│   │   └── presets.ts              # ムード5段階キーカラー & アイコンプリセット
│   ├── services/
│   │   ├── storage.ts              # IndexedDB 永続化 & Moodistory インポーター
│   │   ├── dailySync.ts            # 日次 JSON / 画像メタ生成 & Android 同期ブリッジ
│   │   ├── imageUtils.ts           # クライアント側 Canvas 画像リサイズ・JPEG圧縮
│   │   └── notification.ts         # リマインダー通知スケジューラ
│   └── App.tsx
└── build-apk.sh              # スタンドアロン APK ビルドスクリプト
```

---

## 📄 ライセンス

MIT License
