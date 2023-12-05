#!/usr/bin/env bash

build() {
  echo "Compiling..."

  npm run compile
  cp src/metadata.json dist/compiled/metadata.json
  # cp src/stylesheet.css dist/compiled/stylesheet.css

  echo "Packing..."

  EXCLUDE=("metadata.json" "extension.js" "stylesheet.css" "prefs.ts")
  TSSRCDIR="$PWD/src"
  JSSRCDIR="$PWD/dist/compiled"
  BUILDDIR="$PWD/dist/builds"

  EXTRASRC=$(find "$TSSRCDIR" -type f ! \( -name "${EXCLUDE[0]}" -o -name "${EXCLUDE[1]}" -o -name "${EXCLUDE[2]}" \))
  ESFLAGS=$(for FILE in $EXTRASRC; do echo -n "--extra-source=$FILE "; done | sed 's/ $//')

  SCHEMA="$PWD/assets/schemas/org.gnome.shell.extensions.wallhub.gschema.xml"
  PODIR="$PWD/assets/locale"

  mkdir -p "$BUILDDIR"

  if [ -z "$ESFLAGS" ]; then
    gnome-extensions pack -f -o "$BUILDDIR" --schema="$SCHEMA" --podir="$PODIR" "$JSSRCDIR"
  else
    gnome-extensions pack -f -o "$BUILDDIR" --schema="$SCHEMA" --podir="$PODIR" "$ESFLAGS" "$JSSRCDIR"
  fi

}

enable() {
  echo "Enabling..."
  gnome-extensions enable wallhub@sakithb.github.io
}

disable() {
  echo "Disabling..."
  gnome-extensions disable wallhub.sakithb.github.io
}

case "$1" in
build)
  build
  ;;
enable)
  enable
  ;;
disable)
  disable
  ;;
*)
  echo "Usage: $0 {build|enable|disable}"
  exit 1
  ;;
esac
