# Video player

Widget Wizard uses the player to display live video and position widgets on the
visible image. The streaming implementation is being moved into this directory
so that the application can own playback, stream information and geometry.

## Current design

`VideoPlayer` handles camera authorization, fullscreen and the overlay surface.
`CustomPlayer` manages playback settings, playback requests and the player
controls. The Axis library still supplies the playback components and client
stream information. The migration must preserve the existing UI.

The existing format identifiers are saved in local storage and must remain
compatible with previous installations.

| Format     | Transport and codec        | Media element |
| ---------- | -------------------------- | ------------- |
| `MP4_H264` | HTTP MP4, H.264            | Video         |
| `RTP_H264` | RTSP over WebSocket, H.264 | Video         |
| `RTP_JPEG` | RTSP over WebSocket, JPEG  | Canvas        |
| `MJPEG`    | HTTP MJPEG                 | Image         |
| `JPEG`     | HTTP still image           | Image         |

## Dimensions

The `Dimensions` interface describes two coordinate spaces: the intrinsic
stream resolution and the visible image rectangle in CSS pixels relative to
the outer player container. Widget overlays use the latter rectangle, excluding
black bars around centered video.

`videoDimensions.ts` calculates this rectangle without reading the DOM.
`VideoPlayer` still owns the element reference and resize observers. The
existing delayed measurements and observer lifecycle are not changed yet.

## Regression checks

Run `yarn test`, `yarn lint` and `yarn build` from the `web` directory.
The geometry tests cover aspect ratios, container offsets, zero dimensions
and the existing subpixel tolerance.

Before replacing a playback implementation, verify it on a supported camera:

- Play, stop, refresh, switch formats and change camera, resolution and FPS.
- Hide and restore the browser tab during playback and after pressing Stop.
- Check recovery after stream interruption where retry is supported.
- Check audio controls for streams with audio, screenshots and the client
  stream information in both expanded and collapsed states.
- Check widget alignment during resolution changes, fullscreen and resizing.
- Check saved format and stream settings after reloading the page.

Automated tests cannot establish device compatibility or playback latency.
Those require real camera and browser testing.

## Upstream reference

The archived [Axis media stream library](https://github.com/AxisCommunications/media-stream-library-js)
is the reference for the existing transport and playback behavior.
Any upstream code brought into this directory must retain its MIT license and
copyright notice. Replace the existing dependencies only after all current
formats are supported and tested.
