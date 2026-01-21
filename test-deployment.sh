#!/bin/bash

echo "Testing Game Library Manager Deployment"
echo "========================================"

# Test API endpoint
echo -e "\n1. Testing API endpoint..."
RESPONSE=$(curl -s https://game-library-manager-web.onrender.com/api/admin-config)
if echo "$RESPONSE" | grep -q "success"; then
    echo "✅ API is working!"
    echo "Response: $RESPONSE"
else
    echo "❌ API not working - server not running"
    echo "Response: $RESPONSE"
    exit 1
fi

# Test admin authentication
echo -e "\n2. Testing admin authentication..."
ADMIN_RESPONSE=$(curl -s -X POST https://game-library-manager-web.onrender.com/api/admin-config \
    -H "Content-Type: application/json" \
    -H "X-Admin-Token: glm-admin-2024" \
    -d '{"hiddenTabs":["test1","test2"]}')
    
if echo "$ADMIN_RESPONSE" | grep -q "success"; then
    echo "✅ Admin authentication working!"
else
    echo "❌ Admin authentication failed"
    echo "Response: $ADMIN_RESPONSE"
fi

# Check hidden tabs persistence
echo -e "\n3. Checking hidden tabs..."
TABS_RESPONSE=$(curl -s https://game-library-manager-web.onrender.com/api/admin-config | jq -r '.config.hiddenTabs')
echo "Hidden tabs: $TABS_RESPONSE"

echo -e "\n✅ All tests complete!"