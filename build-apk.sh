#!/bin/zsh
set -e

PROJECT_DIR="${0:A:h}"
MAIN_DIR="$PROJECT_DIR/android/app/src/main"
BUILD_DIR="$PROJECT_DIR/android/build"
SDK_DIR="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
BUILD_TOOLS="$SDK_DIR/build-tools/35.0.0"
PLATFORM_JAR="$SDK_DIR/platforms/android-35/android.jar"
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
KOTLIN_HOME="/Applications/Android Studio.app/Contents/plugins/Kotlin/kotlinc"

export JAVA_HOME
export PATH="$JAVA_HOME/bin:$PATH"

echo "0. Building web bundle and syncing to Android assets..."
cd "$PROJECT_DIR"
npm run build
rm -rf "$MAIN_DIR/assets/www"
mkdir -p "$MAIN_DIR/assets/www"
cp -R "$PROJECT_DIR/dist/"* "$MAIN_DIR/assets/www/"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/compiled_res" "$BUILD_DIR/gen" "$BUILD_DIR/classes" "$BUILD_DIR/dex"

echo "1. Compiling resources with aapt2..."
"$BUILD_TOOLS/aapt2" compile --dir "$MAIN_DIR/res" -o "$BUILD_DIR/compiled_res/res.zip"

echo "2. Linking resources and assets with aapt2..."
"$BUILD_TOOLS/aapt2" link \
  -I "$PLATFORM_JAR" \
  --manifest "$MAIN_DIR/AndroidManifest.xml" \
  -A "$MAIN_DIR/assets" \
  -R "$BUILD_DIR/compiled_res/res.zip" \
  --java "$BUILD_DIR/gen" \
  -o "$BUILD_DIR/unaligned.apk" \
  --auto-add-overlay

echo "3. Compiling R.java and Kotlin sources..."
"$JAVA_HOME/bin/javac" -source 17 -target 17 -cp "$PLATFORM_JAR" -d "$BUILD_DIR/classes" "$BUILD_DIR/gen/com/minimal/moodtracker/R.java"

"$JAVA_HOME/bin/java" -cp "$KOTLIN_HOME/lib/kotlin-preloader.jar" \
  org.jetbrains.kotlin.preloading.Preloader \
  -cp "$KOTLIN_HOME/lib/kotlin-compiler.jar" \
  org.jetbrains.kotlin.cli.jvm.K2JVMCompiler \
  -jvm-target 17 \
  -cp "$PLATFORM_JAR:$BUILD_DIR/classes" \
  -d "$BUILD_DIR/classes" \
  "$MAIN_DIR/java/com/minimal/moodtracker/MainActivity.kt" \
  "$MAIN_DIR/java/com/minimal/moodtracker/CameraFileProvider.kt" \
  "$MAIN_DIR/java/com/minimal/moodtracker/DailySyncManager.kt" \
  "$MAIN_DIR/java/com/minimal/moodtracker/QuickMoodWidgetProvider.kt" \
  "$MAIN_DIR/java/com/minimal/moodtracker/PhotoMoodWidgetProvider.kt" \
  "$MAIN_DIR/java/com/minimal/moodtracker/ReminderReceiver.kt"

echo "4. Converting classes + kotlin-stdlib to DEX with d8..."
CLASS_FILES=($BUILD_DIR/classes/**/*.class)
"$BUILD_TOOLS/d8" \
  --lib "$PLATFORM_JAR" \
  --min-api 26 \
  --output "$BUILD_DIR/dex" \
  "${CLASS_FILES[@]}" \
  "$KOTLIN_HOME/lib/kotlin-stdlib.jar"

echo "5. Packaging classes.dex into APK..."
cd "$BUILD_DIR/dex"
zip -q "$BUILD_DIR/unaligned.apk" classes*.dex

echo "6. Aligning APK with zipalign..."
"$BUILD_TOOLS/zipalign" -f -p 4 "$BUILD_DIR/unaligned.apk" "$BUILD_DIR/aligned.apk"

echo "7. Generating debug keystore (if not exists) and signing APK..."
KEYSTORE="$PROJECT_DIR/android/debug.keystore"
if [ ! -f "$KEYSTORE" ]; then
  "$JAVA_HOME/bin/keytool" -genkeypair \
    -keystore "$KEYSTORE" \
    -storepass android \
    -keypass android \
    -alias androiddebugkey \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -dname "CN=Android Debug,O=Android,C=US"
fi

FINAL_APK="$PROJECT_DIR/MoodTracker-debug.apk"
"$BUILD_TOOLS/apksigner" sign \
  --ks "$KEYSTORE" \
  --ks-pass pass:android \
  --key-pass pass:android \
  --ks-key-alias androiddebugkey \
  --out "$FINAL_APK" \
  "$BUILD_DIR/aligned.apk"

echo "APK built successfully: $FINAL_APK"
ls -lh "$FINAL_APK"
