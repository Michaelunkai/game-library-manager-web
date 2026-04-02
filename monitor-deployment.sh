#!/bin/bash

echo "🔍 Monitoring Game Library Manager Deployment"
echo "============================================="

URL="https://game-library-manager-web.onrender.com/api/admin-config"
INTERVAL=30
MAX_ATTEMPTS=20
ATTEMPT=0

echo -e "\n📡 Checking API endpoint every ${INTERVAL} seconds..."
echo "URL: $URL"

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    ATTEMPT=$((ATTEMPT + 1))
    echo -e "\n🔄 Attempt $ATTEMPT of $MAX_ATTEMPTS..."
    
    # Make request and capture response
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
    
    if [ "$RESPONSE" = "200" ]; then
        echo "✅ SUCCESS! Server is running!"
        echo -e "\n📊 Server Response:"
        curl -s "$URL" | python -m json.tool
        echo -e "\n🎉 Deployment complete! Admin features are now working."
        exit 0
    elif [ "$RESPONSE" = "404" ]; then
        echo "❌ API endpoint not found (404) - Server not running yet"
    else
        echo "⚠️  HTTP Status: $RESPONSE"
    fi
    
    if [ $ATTEMPT -lt $MAX_ATTEMPTS ]; then
        echo "⏳ Waiting ${INTERVAL} seconds before next check..."
        sleep $INTERVAL
    fi
done

echo -e "\n❌ Maximum attempts reached. Server may need manual configuration on Render dashboard."
echo "Please check: https://dashboard.render.com"
exit 1