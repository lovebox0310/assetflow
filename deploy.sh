#!/bin/bash
# AssetFlow one-command deploy (backend + frontend)
# Usage: sudo /home/redbox9/assetflow-dev/deploy.sh
set -e

ROOT="/home/redbox9/assetflow-dev"
BACKEND_DIR="$ROOT/apps/backend"
FRONTEND_DIR="$ROOT/apps/frontend"
DEPLOY_DIR="/opt/assetflow"
BUILD_USER="redbox9"

# nvm/pnpm 등은 redbox9 환경에 있으므로, 빌드 명령은 해당 사용자 로그인 쉘로 실행한다.
BUILD_SHELL="sudo -u $BUILD_USER -i bash -c"
NODE_BIN="/home/redbox9/.nvm/versions/node/v22.15.1/bin"
RUN_BUILD="export PATH='$NODE_BIN:\$PATH' && cd"

echo "[1/6] Frontend dependency install..."
$BUILD_SHELL "$RUN_BUILD '$FRONTEND_DIR' && pnpm install"

echo "[2/6] Frontend build..."
$BUILD_SHELL "$RUN_BUILD '$FRONTEND_DIR' && pnpm run build"

echo "[3/6] Backend build..."
$BUILD_SHELL "$RUN_BUILD '$BACKEND_DIR' && ./gradlew bootJar"

echo "[4/6] Deploy frontend..."
rm -rf "$DEPLOY_DIR/frontend/"*
cp -r "$FRONTEND_DIR/dist/"* "$DEPLOY_DIR/frontend/"

echo "[5/6] Deploy backend..."
if [ -f "$DEPLOY_DIR/app.jar" ]; then
    cp "$DEPLOY_DIR/app.jar" "$DEPLOY_DIR/app.jar.bak-$(date +%Y%m%d-%H%M%S)"
fi
cp "$BACKEND_DIR/build/libs/assetflow-backend-0.0.1-SNAPSHOT.jar" "$DEPLOY_DIR/app.jar"

echo "[6/6] Deploy HyundaiCard VestMail extractor..."
VESTMAIL_DIR="$DEPLOY_DIR/scripts/card/vestmail-hyundai"
mkdir -p "$VESTMAIL_DIR"
rm -rf "$VESTMAIL_DIR/"*
# node_modules 는 install.sh 가 새로 설치하므로 소스 파일만 복사한다.
for file in extract-hyundai-vestmail.mjs package.json package-lock.json README.md install.sh; do
    cp "$BACKEND_DIR/src/main/resources/scripts/card/vestmail-hyundai/$file" "$VESTMAIL_DIR/"
done
chmod +x "$VESTMAIL_DIR/install.sh"
# npm install 이 소유 사용자로 파일을 쓸 수 있도록 권한을 맞춘다.
chown -R "$BUILD_USER:$BUILD_USER" "$VESTMAIL_DIR"
$BUILD_SHELL "export PATH='$NODE_BIN:\$PATH' && cd '$VESTMAIL_DIR' && ./install.sh"

# 환경변수가 없으면 경고만 한다(값은 출력하지 않는다).
if [ -f "$ENV_FILE" ]; then
    if ! grep -qE '^VESTMAIL_HYUNDAI_SCRIPT_DIR=' "$ENV_FILE" 2>/dev/null; then
        echo "WARN: VESTMAIL_HYUNDAI_SCRIPT_DIR is not set in $ENV_FILE"
        echo "      Add: VESTMAIL_HYUNDAI_SCRIPT_DIR=$VESTMAIL_DIR"
    fi
else
    echo "WARN: $ENV_FILE not found — VestMail Hyundai extractor will fall back to classpath (slower)"
fi

echo "[7/7] Restart service..."

# §62 KIS 환경변수를 서비스에 주입한다. 파일이 없어도 기동은 계속한다(- 접두사).
KIS_CONF="/etc/systemd/system/assetflow.service.d/kis.conf"
if [ ! -f "$KIS_CONF" ]; then
    mkdir -p "$(dirname "$KIS_CONF")"
    cat > "$KIS_CONF" << 'EOF'
[Service]
EnvironmentFile=-/opt/assetflow/assetflow.env
EOF
    chmod 644 "$KIS_CONF"
    systemctl daemon-reload
fi

# KIS 설정이 누락되었는지 경고만 한다(값은 출력하지 않는다).
# §62.2: appKey/appSecret 은 DB 에 계좌별로 저장되므로 환경변수에서 제외했다.
ENV_FILE="/opt/assetflow/assetflow.env"
if [ -f "$ENV_FILE" ]; then
    if ! grep -qE '^KIS_ENABLED=(true|yes|1)$' "$ENV_FILE" 2>/dev/null; then
        echo "WARN: KIS_ENABLED is not true in $ENV_FILE"
    fi
    if ! grep -qE '^CARD_IMPORT_KEY=[^[:space:]]+$' "$ENV_FILE" 2>/dev/null; then
        echo "WARN: CARD_IMPORT_KEY is empty in $ENV_FILE — KIS/Card credentials cannot be decrypted after restart"
    fi
else
    echo "WARN: $ENV_FILE not found — KIS will be disabled"
fi

systemctl restart assetflow.service

echo "Deploy completed."
echo "Check status: sudo systemctl status assetflow.service"
