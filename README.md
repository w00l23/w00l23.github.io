# w00l23.github.io

The home page of Mina Systems. One plain HTML file, no frameworks.

The hero is the real sky over Houston at this minute, drawn on a 2D canvas:
the Yale Bright Star Catalogue to magnitude 5.6 (packed into the page, 26 KB),
the planets from JPL's Keplerian elements and the Moon from Meeus, the same
sources as the solar-system demo, with the Milky Way as a band of soft light
along the galactic plane, faint lines for the constellation figures, and the
Andromeda galaxy, bigger than life, where it really is, fading in as the sky
darkens. By day the sky is a dark dusk blue. It looks at the stretch of sky
with the most in it and holds still; it is drawn again once a minute, on a
resize, or on a tap, which names a star. A drag (mouse or finger) turns the view
a little way: up to 28 degrees to each side and 8 degrees up, with a soft limit,
and it glides to a stop. The stars stay where they really are; only the view turns. "Use my sky" asks before reading your
location, which stays on the device. `?t=` previews another hour, e.g.
`?t=2026-12-24T21:00:00-06:00`, and `?az=` aims the view (0 is north).

Behind the rest of the page: a still field of stars, drawn once. Beside each
heading a star, and a thread of light drawn by scrolling into the Iluminara link.

The demo cards show a still picture. Under a mouse, or on a phone's first tap,
the demo itself loads into the picture's place, small and silent; the second tap
opens it. One preview at a time, fetched only when asked for, and removed when
the pointer leaves, the card scrolls away or the tab hides. The Iluminara phones
lean a few degrees as they scroll past.

With Reduce Motion on: no drag, no lean, no live previews (the cards are their
still pictures and plain links). Data Saver also keeps the previews off.

`assets/` holds the card previews and the Iluminara screenshots.
