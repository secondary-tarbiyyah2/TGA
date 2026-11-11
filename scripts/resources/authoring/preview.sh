#!/bin/bash
# preview.sh <subject[,subject]> <regex for files to render...>   (BUILD=0 skips the build)
# SCRATCH: a folder outside the repo with the generator tools installed (npm install docx@9.5.1 world-atlas@2.0.2 topojson-client@3.1.0)
# PW_MODULES: the node_modules that holds playwright (default /opt/npm-tools/node_modules)
S=${SCRATCH:?set SCRATCH to a scratch folder}
WT=$(cd "$(dirname "$0")/../../.." && pwd)
if [ "${BUILD:-1}" = 1 ]; then
  rm -rf $S/out; mkdir -p $S/out
  cd $WT
  for s in ${1//,/ }; do NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt NODE_PATH=${PW_MODULES:-/opt/npm-tools/node_modules}:$S/node_modules node scripts/resources/build.mjs $S/out --only=$s 2>&1 | tail -2; done
fi
shift
cd $S/out
rm -f p*.png
i=0
for pat in "$@"; do
  f=$(find . -name "*.pdf" | grep -E "$pat" | head -1)
  [ -z "$f" ] && { echo "no match $pat"; continue; }
  i=$((i+1)); pdftoppm -r 50 -png -f 1 -l ${PAGES:-1} "$f" "p$i"; echo "p$i: $f ($(pdfinfo "$f" | grep Pages))"
done
