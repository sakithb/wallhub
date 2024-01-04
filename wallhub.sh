#!/usr/bin/env bash
set -e

nested() {
  export MUTTER_DEBUG_DUMMY_MODE_SPECS=1366x768
  dbus-run-session -- gnome-shell --unsafe-mode --nested --wayland --no-x11
}

build() {
  echo "Compiling..."
  npm run compile

  if [ "$1" = "release" ]; then
    echo "Prettifying..."
    npm run compile:padding 1>/dev/null

    echo "Stripping debug values..."
    sed 's/const DEBUG = true;/const DEBUG = false;/g' ./dist/compiled/utils/misc.js >./dist/compiled/utils/misc.js.tmp
    mv ./dist/compiled/utils/misc.js.tmp ./dist/compiled/utils/misc.js
  fi

  cp src/metadata.json dist/compiled/metadata.json
  cp src/stylesheet.css dist/compiled/stylesheet.css 2>/dev/null || :

  echo "Packing..."

  EXCLUDEFILES=("metadata.json" "extension.js" "prefs.js" "stylesheet.css")
  EXCLUDEDIRS=("compiled")
  JSSRCDIR="$PWD/dist/compiled"
  BUILDDIR="$PWD/dist/builds"

  FINDFARGS=()

  for F in "${EXCLUDEFILES[@]}"; do
    FINDFARGS+=("!" "-name" "$F")
  done

  FINDDARGS=()

  for D in "${EXCLUDEDIRS[@]}"; do
    FINDDARGS+=("!" "-name" "$D")
  done

  EXTRAFILES=$(find "$JSSRCDIR" -maxdepth 1 -type f "${FINDFARGS[@]}")
  EXTRADIRS=$(find "$JSSRCDIR" -type d "${FINDDARGS[@]}")
  ESFLAGS=()

  for F in $EXTRAFILES; do
    ESFLAGS+=("--extra-source=$F")
  done

  for D in $EXTRADIRS; do
    ESFLAGS+=("--extra-source=$D")
  done

  SCHEMA="$PWD/assets/org.gnome.shell.extensions.wallhub.gschema.xml"
  PODIR="$PWD/assets/locale"

  mkdir -p "$BUILDDIR"
  gnome-extensions pack -f -o "$BUILDDIR" --schema="$SCHEMA" --podir="$PODIR" "${ESFLAGS[@]}" "$JSSRCDIR"
}

debug() {
  echo "Debugging..."
  build
  install
  nested
}

reload() {
  echo "Reloading..."
  build
  install

  if [ "$XDG_SESSION_TYPE" = "x11" ]; then
    pkill -HUP gnome-shell
  else
    echo "Reloading Wayland session is not supported yet."
  fi
}

lint() {
  echo "Linting..."
  npm run lint
}

format() {
  echo "Formatting..."
  npm run format
}

install() {
  echo "Installing..."
  gnome-extensions install --force ./dist/builds/wallhub@sakithb.github.io.shell-extension.zip
}

uninstall() {
  echo "Uninstalling..."
  gnome-extensions uninstall wallhub@sakithb.github.io
}

enable() {
  echo "Enabling..."
  gnome-extensions enable wallhub@sakithb.github.io
}

disable() {
  echo "Disabling..."
  gnome-extensions disable wallhub@sakithb.github.io
}

prefs() {
  echo "Opening prefs..."
  gnome-extensions prefs wallhub@sakithb.github.io
}

watch() {
  echo "Watching for setting changes..."
  dconf watch /org/gnome/shell/extensions/wallhub/
}

case "$1" in
release)
  build "release"
  ;;
build)
  build
  ;;
debug)
  debug
  ;;
reload)
  reload
  ;;
lint)
  lint
  ;;
format)
  format
  ;;
install)
  install
  ;;
uninstall)
  uninstall
  ;;
enable)
  enable
  ;;
disable)
  disable
  ;;
prefs)
  prefs
  ;;
watch)
  watch
  ;;
*)
  echo "Usage: $0 {prod|build|debug|lint|format|install|uninstall|enable|disable|prefs|watch}"
  exit 1
  ;;
esac
