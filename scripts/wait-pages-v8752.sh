#!/bin/bash
# 等 Pages 收敛到 v8.7.52
for i in $(seq 1 40); do
  V=$(curl -s "https://lxgssy.github.io/Start-chushi/version.json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('v',''))" 2>/dev/null)
  echo "[$i] online v=$V"
  if [ "$V" = "8.7.52" ]; then echo "CONVERGED"; exit 0; fi
  sleep 15
done
echo "TIMEOUT"
exit 1
