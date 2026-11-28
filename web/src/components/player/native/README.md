# Video player

Widget Wizard uses the player to display live video and position widgets on the
visible image. The streaming implementation is being moved into this directory
so that the application can own playback, stream information and geometry.

## Current design

`VideoPlayer` handles camera authorization, fullscreen and the overlay surface.
`CustomPlayer` manages playback settings, playback requests and the player
controls. Native HTTP image playback is used for JPEG and MJPEG. The Axis
library still supplies MP4 and RTSP playback and client stream information.
The migration must preserve the existing UI.

The player owns the format identifiers, native media element type and VAPIX
parameters in `types.ts`. The identifiers stored in local storage are unchanged.
An invalid or unsupported saved identifier falls back to the initial format
without overwriting the saved value.

`CustomPlayer` converts the selected format to the library enum for playback
and client statistics. The controls still use the library's `VideoProperties`
for progress information until the playback and statistics interfaces are
replaced.

| Format     | Transport and codec        | Media element |
| ---------- | -------------------------- | ------------- |
| `MP4_H264` | HTTP MP4, H.264            | Video         |
| `RTP_H264` | RTSP over WebSocket, H.264 | Video         |
| `RTP_JPEG` | RTSP over WebSocket, JPEG  | Canvas        |
| `MJPEG`    | HTTP MJPEG                 | Image         |
| `JPEG`     | HTTP still image           | Image         |

## Stream URLs

`streamUrls.ts` builds the VAPIX request URLs for each existing format.
It preserves supplied device parameters and selects the codec and container
required by the format. For RTSP it also returns the WebSocket transport
and session token URLs. An empty host returns no stream URL.

HTTP image playback uses this helper. MP4 and RTSP playback still use
the library's URL construction.

See [VAPIX media streaming over HTTP](https://developer.axis.com/vapix/network-video/media-stream-over-http/)
and the [upstream playback component](https://github.com/AxisCommunications/media-stream-library-js/blob/main/src/player/PlaybackArea.tsx)
for the existing endpoints and parameter behavior.

## HTTP image playback

`HttpImage.tsx` uses an image element for both JPEG and MJPEG. It passes
the actual element to the parent through a React ref and uses
`imageStream.ts` to manage each request.

Each request has a fresh cache-busting value, even when restarting an
unchanged URL. A load event reports the intrinsic dimensions once they are
available, and subsequent load events report only changes in dimensions.
Stopping playback or replacing the image removes its source and listener.
A new URL uses a new element, so events from the previous request cannot
report dimensions for the new stream.

`usePlaybackProperties.ts` associates stream properties with the active
request. Screenshots, statistics and volume controls only use reports from
the current request. The last known aspect ratio remains available while
waiting for the next stream, so the video area retains its previous layout.
The remaining upstream playback area is also keyed by the request settings
so callbacks from replaced components retain their original request identity.

HTTP image errors do not use the RTSP retry path. The browser remains
responsible for decoding multipart MJPEG; per-frame statistics are not
introduced in this step.

## Dimensions

The `Dimensions` interface describes two coordinate spaces: the intrinsic
stream resolution and the visible image rectangle in CSS pixels relative to
the outer player container. Widget overlays use the latter rectangle, excluding
black bars around centered video.

`videoDimensions.ts` calculates this rectangle without reading the DOM.
`VideoPlayer` owns the media element reference. `videoDimensionObserver.ts`
observes the current element and container, replacing observers and listeners
when the library changes the element. Video resize and image load events,
and changes to canvas dimensions, also trigger measurements.

`CustomPlayer` notifies `VideoPlayer` after committing stream changes, rather
than reading the element before React updates it. The library currently calls
forwarded callback refs during render, so the existing object ref is retained.
Playback properties, fullscreen and client statistics layout changes trigger
measurements after React commits the updated layout. The limiter also triggers
a measurement after resizing the video area, including when the video moves
without changing its own dimensions. No fixed animation frame delay is needed.

## Regression checks

Run `yarn test`, `yarn lint` and `yarn build` from the `web` directory.
The geometry tests cover aspect ratios, container offsets, zero dimensions
and the existing subpixel tolerance. Observer tests cover element replacement,
intrinsic dimension events and cleanup. Format tests cover the saved identifiers
and fallback for invalid values. URL tests cover all existing formats, encoding,
secure connections, custom ports and missing hosts. Image request tests cover
load events, dimension changes, cleanup and restarting the same URL.
Playback property tests cover replacement, late reports and retaining the
aspect ratio during reconnection.

Before replacing a playback implementation, verify it on a supported camera:

- Play, stop, refresh, switch formats and change camera, resolution and FPS.
- Hide and restore the browser tab during playback and after pressing Stop.
- Check recovery after stream interruption where retry is supported.
- Check audio controls for streams with audio, screenshots and the client
  stream information in both expanded and collapsed states.
- Check widget alignment during resolution changes, fullscreen, resizing and
  when expanding, collapsing or hiding the client stream information.
- Check saved format and stream settings after reloading the page.

Automated tests cannot establish device compatibility or playback latency.
Those require real camera and browser testing.

## Upstream reference

The archived [Axis media stream library](https://github.com/AxisCommunications/media-stream-library-js)
is the reference for the existing transport and playback behavior.
Any upstream code brought into this directory must retain its MIT license and
copyright notice. Replace the existing dependencies only after all current
formats are supported and tested.
