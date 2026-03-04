#!/bin/bash
# Download correct game cover images from Steam CDN and other sources
# Format: 600x900 portrait covers (library_600x900.jpg)
# Falls back to header.jpg if portrait not available
# Output: public/images/{gameid}.png

IMGDIR="public/images"
mkdir -p "$IMGDIR"

download_steam() {
  local id="$1"
  local appid="$2"
  local outfile="$IMGDIR/${id}.png"

  echo "Downloading $id (Steam $appid)..."
  # Try portrait 600x900 first
  if curl -sfL "https://cdn.akamai.steamstatic.com/steam/apps/${appid}/library_600x900.jpg" -o "${outfile}.tmp" && [ -s "${outfile}.tmp" ]; then
    mv "${outfile}.tmp" "$outfile"
    echo "  OK (portrait) - $(wc -c < "$outfile") bytes"
  # Fallback to header
  elif curl -sfL "https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg" -o "${outfile}.tmp" && [ -s "${outfile}.tmp" ]; then
    mv "${outfile}.tmp" "$outfile"
    echo "  OK (header) - $(wc -c < "$outfile") bytes"
  else
    rm -f "${outfile}.tmp"
    echo "  FAILED - could not download from Steam"
  fi
}

download_url() {
  local id="$1"
  local url="$2"
  local outfile="$IMGDIR/${id}.png"

  echo "Downloading $id from URL..."
  if curl -sfL "$url" -o "${outfile}.tmp" && [ -s "${outfile}.tmp" ]; then
    mv "${outfile}.tmp" "$outfile"
    echo "  OK - $(wc -c < "$outfile") bytes"
  else
    rm -f "${outfile}.tmp"
    echo "  FAILED - $url"
  fi
}

echo "=============================="
echo "SECTION 1: GAMES WITHOUT ANY IMAGE"
echo "=============================="

download_steam "oriandthewillofthewisps"              1057090
download_steam "lostepic"                              1287310
download_steam "hadesii"                               1145350
download_steam "childrenofmorta"                       422040
download_steam "gothic3"                               39810
download_steam "octopathtraveler"                      921570
download_steam "titanquestanniversaryedition"          475150
download_steam "tunic"                                 553420
download_steam "norestforthewicked"                    1371980
download_steam "suikodeniandiihdremaster"              1931000
download_steam "miside"                                2527500
download_steam "banishersghostsofneweden"              1454490

echo ""
echo "=============================="
echo "SECTION 2: GAMES WITH PLACEHOLDER IMAGES (10796B)"
echo "=============================="

download_steam "rivals2"                               2217060
download_steam "thecub"                                1590640
download_steam "spongbobbfbbr"                         1241870
download_steam "thegreataceattorney"                   1158460

echo ""
echo "=============================="
echo "SECTION 3: CORRUPT/TINY IMAGES"
echo "=============================="

download_steam "deltarune"                             1671400
download_steam "morkredd"                              923290
download_steam "MiddleearthShadowofWar"                356190
download_steam "DaysGone"                              1259420
download_steam "codblackops2"                          202970

echo ""
echo "=============================="
echo "SECTION 4: SMALL/LOW-QUALITY IMAGES"
echo "=============================="

download_steam "MindsEye"                              2881650
download_steam "ScottPilgrimCompletedition"            1061040

echo ""
echo "=============================="
echo "DONE"
echo "=============================="
