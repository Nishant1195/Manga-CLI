#!/usr/bin/env python3
import sys
import os
import gi

gi.require_version("Gtk", "4.0")
gi.require_version("Gdk", "4.0")
from gi.repository import Gtk, Gdk, GLib, Gio

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}


class MangaReaderWindow(Gtk.ApplicationWindow):
    def __init__(self, app, target_dir):
        super().__init__(application=app, title="Manga Reader (Debug Styling)")
        self.set_default_size(900, 1200)

        self.target_dir = os.path.abspath(target_dir)
        self.loaded_files = set()

        # Debug CSS styling:
        # Window & ScrolledWindow background: Dark Red (#4a0d0d)
        # Gtk.Box background: Bright Blue (#0055ff) to visualize Box boundary
        css_provider = Gtk.CssProvider()
        css_provider.load_from_data(
            b"""
            window, scrolledwindow, viewport { background-color: #4a0d0d; }
            .debug-box { background-color: #0055ff; }
            picture { background-color: #00ff66; }
            """
        )
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(),
            css_provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION,
        )

        # Scrolled window containing vertical box
        self.scrolled_window = Gtk.ScrolledWindow()
        self.scrolled_window.set_hexpand(True)
        self.scrolled_window.set_vexpand(True)
        self.scrolled_window.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)

        self.box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8)
        self.box.set_hexpand(True)
        self.box.set_halign(Gtk.Align.CENTER)
        self.box.add_css_class("debug-box")

        self.scrolled_window.set_child(self.box)
        self.set_child(self.scrolled_window)

        # Keypress controller ('q' to quit)
        key_controller = Gtk.EventControllerKey()
        key_controller.connect("key-pressed", self.on_key_pressed)
        self.add_controller(key_controller)

        # Initial folder scan
        self.poll_folder()

        # Timer for polling folder every 1 second
        GLib.timeout_add(1000, self.poll_folder)

    def on_key_pressed(self, controller, keyval, keycode, state):
        if keyval == Gdk.KEY_q:
            self.close()
            return True
        return False

    def poll_folder(self):
        if not os.path.exists(self.target_dir):
            return True

        try:
            entries = os.listdir(self.target_dir)
        except Exception as e:
            print(f"Error reading directory {self.target_dir}: {e}")
            return True

        valid_images = [
            f for f in entries
            if not f.startswith(".")
            and os.path.splitext(f)[1].lower() in IMAGE_EXTENSIONS
        ]
        valid_images.sort()

        new_files = [f for f in valid_images if f not in self.loaded_files]
        if not new_files:
            return True

        for filename in new_files:
            file_path = os.path.join(self.target_dir, filename)
            gfile = Gio.File.new_for_path(file_path)
            picture = Gtk.Picture.new_for_file(gfile)
            picture.set_content_fit(Gtk.ContentFit.CONTAIN)
            picture.set_can_shrink(False)
            picture.set_halign(Gtk.Align.CENTER)

            self.box.append(picture)
            self.loaded_files.add(filename)

        return True


class MangaReaderApp(Gtk.Application):
    def __init__(self, target_dir):
        super().__init__(application_id="org.mangacli.reader.debug")
        self.target_dir = target_dir

    def do_activate(self):
        win = MangaReaderWindow(self, self.target_dir)
        win.present()


def main():
    target_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    app = MangaReaderApp(target_dir)
    app.run(None)


if __name__ == "__main__":
    main()
