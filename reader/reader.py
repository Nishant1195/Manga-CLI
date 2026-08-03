#!/usr/bin/env python3
import sys
import os
import gi

gi.require_version("Gtk", "4.0")
gi.require_version("Gdk", "4.0")
gi.require_version("GdkPixbuf", "2.0")
from gi.repository import Gtk, Gdk, GLib, Gio, GdkPixbuf

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}


class MangaReaderWindow(Gtk.ApplicationWindow):
    def __init__(self, app, target_dir):
        super().__init__(application=app, title="Manga Reader")
        self.set_default_size(900, 1200)

        self.target_dir = os.path.abspath(target_dir)
        self.loaded_files = set()
        self.picture_records = []  # List of tuples: (picture_widget, orig_width, orig_height)
        self.zoom_level = 1.0

        # Clean up any leftover signal file at launch
        signal_file = os.path.join(self.target_dir, ".chapter-nav-signal")
        if os.path.exists(signal_file):
            try:
                os.remove(signal_file)
            except Exception:
                pass

        # Dark theme styling
        css_provider = Gtk.CssProvider()
        css_provider.load_from_data(
            b"window, scrolledwindow, viewport { background-color: #121212; }"
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
        # Enable horizontal scrolling so zoomed images can pan horizontally
        self.scrolled_window.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC)

        self.box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8)
        self.box.set_hexpand(True)
        self.box.set_halign(Gtk.Align.FILL)

        self.scrolled_window.set_child(self.box)
        self.set_child(self.scrolled_window)

        # Keypress controller ('q' to quit, +/- for zoom, Left/Right for pan, [/] for prev/next chapter)
        key_controller = Gtk.EventControllerKey()
        key_controller.connect("key-pressed", self.on_key_pressed)
        self.add_controller(key_controller)

        # Listen for window resize signal to recalculate image size requests dynamically
        self.connect("notify::default-width", self.on_window_resized)
        self.connect("notify::default-height", self.on_window_resized)

        # Initial folder scan
        self.poll_folder()

        # Timer for polling folder every 1 second
        GLib.timeout_add(1000, self.poll_folder)

    def write_nav_signal_and_close(self, signal_type):
        signal_file = os.path.join(self.target_dir, ".chapter-nav-signal")
        try:
            with open(signal_file, "w", encoding="utf-8") as f:
                f.write(signal_type)
        except Exception as e:
            print(f"Error writing chapter navigation signal: {e}")
        self.close()

    def on_key_pressed(self, controller, keyval, keycode, state):
        if keyval == Gdk.KEY_q:
            self.close()
            return True
        elif keyval == Gdk.KEY_bracketright:  # ']' for next chapter
            self.write_nav_signal_and_close("next")
            return True
        elif keyval == Gdk.KEY_bracketleft:  # '[' for previous chapter
            self.write_nav_signal_and_close("prev")
            return True
        elif keyval in (Gdk.KEY_equal, Gdk.KEY_plus, Gdk.KEY_KP_Add):
            self.change_zoom(0.1)
            return True
        elif keyval in (Gdk.KEY_minus, Gdk.KEY_KP_Subtract):
            self.change_zoom(-0.1)
            return True
        elif keyval == Gdk.KEY_Left:
            hadj = self.scrolled_window.get_hadjustment()
            if hadj:
                hadj.set_value(max(hadj.get_lower(), hadj.get_value() - 80))
            return True
        elif keyval == Gdk.KEY_Right:
            hadj = self.scrolled_window.get_hadjustment()
            if hadj:
                max_scroll = hadj.get_upper() - hadj.get_page_size()
                hadj.set_value(min(max_scroll, hadj.get_value() + 80))
            return True
        return False

    def change_zoom(self, delta):
        new_zoom = round(self.zoom_level + delta, 2)
        new_zoom = max(0.5, min(3.0, new_zoom))
        if new_zoom != self.zoom_level:
            self.zoom_level = new_zoom
            self.apply_zoom_and_resize()

    def get_container_base_width(self):
        win_width = self.get_width()
        return win_width if win_width > 0 else 900

    def get_target_width(self):
        base_width = self.get_container_base_width()
        return int(round(base_width * self.zoom_level))

    def update_picture_size_request(self, picture, orig_width, orig_height, target_width):
        if orig_width <= 0 or orig_height <= 0:
            return
        # Calculate aspect-ratio height for target width
        target_height = int(round(orig_height * (target_width / orig_width)))
        picture.set_size_request(target_width, target_height)

    def apply_zoom_and_resize(self):
        target_width = self.get_target_width()
        for picture, orig_width, orig_height in self.picture_records:
            self.update_picture_size_request(picture, orig_width, orig_height, target_width)

    def on_window_resized(self, widget, param):
        self.apply_zoom_and_resize()

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

        target_width = self.get_target_width()

        for filename in new_files:
            file_path = os.path.join(self.target_dir, filename)

            # Read real image pixel dimensions via GdkPixbuf.Pixbuf.get_file_info
            orig_width, orig_height = 0, 0
            try:
                info, w, h = GdkPixbuf.Pixbuf.get_file_info(file_path)
                if info and w > 0 and h > 0:
                    orig_width, orig_height = w, h
            except Exception as err:
                print(f"Warning: Could not read image dimensions for {filename}: {err}")

            gfile = Gio.File.new_for_path(file_path)
            picture = Gtk.Picture.new_for_file(gfile)
            picture.set_content_fit(Gtk.ContentFit.CONTAIN)
            picture.set_halign(Gtk.Align.FILL)
            picture.set_hexpand(True)

            # Set size request according to current zoom level & target width
            if orig_width > 0 and orig_height > 0:
                self.update_picture_size_request(picture, orig_width, orig_height, target_width)
                self.picture_records.append((picture, orig_width, orig_height))

            self.box.append(picture)
            self.loaded_files.add(filename)

        return True


class MangaReaderApp(Gtk.Application):
    def __init__(self, target_dir):
        super().__init__(application_id="org.mangacli.reader")
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
