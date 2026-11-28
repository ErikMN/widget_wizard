# Video player

Widget Wizard displays live video and draws widgets over the visible image.
The native player is replacing the archived Axis streaming libraries while
preserving the existing player controls and overlay behavior.

## Responsibilities

`VideoPlayer` handles authorization, fullscreen and overlay geometry.
`CustomPlayer` owns settings, playback intent and controls.
`PlaybackArea.tsx` selects the playback component and forwards its media ref.
Each playback component owns its connection and cleanup.

| Format | Transport | Element | Implementation |
| --- | --- | --- | --- |
| `MP4_H264` | HTTP MP4 | Video | Native |
| `MP4_AV1` | HTTP MP4 | Video | Native |
| `RTP_H264` | RTSP over WebSocket | Video | Axis |
| `RTP_JPEG` | RTSP over WebSocket | Canvas | Axis |
| `MJPEG` | HTTP MJPEG | Image | Native |
| `JPEG` | HTTP still image | Image | Native |

The format identifiers, media element types and request settings are defined
in `types.ts`. The five original format identifiers remain compatible with
saved settings; `MP4_AV1` is new.

The RTSP components still use the Axis playback area.
`legacyPlaybackProperties.ts` adapts their reports to the player's own
`PlaybackProperties` type. The rest of the player does not access the
Axis pipelines.

## Format and resolution availability

AV1 is offered only when `root.Properties.Image.Format` lists `av1` and
MediaSource accepts the AV1 Main profile probe (`av01.0.08M.08`).
The probe is not a guarantee that every AV1 stream will decode.
The MP4 helper checks the actual response MIME type before playback.

An unavailable saved format falls back to the initial format, normally
H.264 MP4, without overwriting the preference.
A saved AV1 choice is restored when the device capabilities become available.

`streamResolutions.ts` reads the codec-specific resolution list for the
selected video channel, then the channel-wide and device-wide lists if
more specific information is missing. VAPIX camera numbers start at one;
parameter group indices start at zero. Special camera values use the
device-wide list.

The settings menu and playback request use the same effective resolution.
A saved resolution excluded by the reported list is omitted from the
request, allowing the device to select its default. The requested value
is retained and restored if it becomes supported again. When no list is
available, the requested resolution is kept.

See [VAPIX image parameters](https://developer.axis.com/vapix/network-video/parameter-management/image-api/)
and the [AV1 integration guide](https://developer.axis.com/video-streaming-and-recording/av1/how-to-guides/integration-guide-av1/).

## Playback lifecycle

A `PlaybackRequest` identifies the format, host, parameters, refresh
count, playback state and RTSP seek offset. Changing the request
invalidates previous playback properties.
`usePlaybackProperties.ts` ignores reports from inactive or terminated
requests and retains the last known aspect ratio while a stream starts.

Playback reports contain the media element and its intrinsic dimensions.
An optional initial volume enables the audio controls. The optional
timeline supplies recording range bounds and a reader for current time,
in seconds relative to the range start. Optional metrics are read from
the active stream when the statistics panel samples them. HTTP playback
reports dimensions only; no placeholder volume or timeline is supplied.

Stopping or hiding the page closes the connection. Returning to the
page restarts playback only if the user has not pressed Stop.
The controls distinguish a requested stream from one that has reported
playback. Termination clears snapshots and statistics and shows the
no-video indicator. Stop and Refresh remain available.

`streamUrls.ts` constructs native VAPIX URLs and preserves supplied device
parameters, overriding the codec and container where required.
For RTSP, it supplies the media, WebSocket and session token URLs.

## HTTP images

`HttpImage.tsx` and `imageStream.ts` use the browser's JPEG decoder.
Each start uses a fresh cache-busting value.
Load events report intrinsic dimensions only when they change.
Stopping or an image error removes the source and listeners.
Errors invalidate playback without automatically retrying.

## HTTP MP4

`HttpMp4Video.tsx` owns the video element and reports its dimensions on
playback and resize. H.264 and AV1 share `httpMp4Stream.ts`, which owns the
HTTP request and MediaSource. The browser parses and decodes the
fragmented MP4 data using the response MIME type.

Each buffer append or removal completes before another begins.
The helper retains about ten seconds of played media and pauses reading
when more than ten seconds are buffered ahead of the playhead.
Old data is removed in intervals of at least one second.
If an append exceeds the buffer quota, older played media is reclaimed
while retaining five seconds behind the playhead, and the append is
retried once. These limits are not a guarantee of fixed memory use.

Stopping aborts the request and pending operations, detaches the source
and revokes the object URL. Stream completion and read failures notify
the existing retry policy. Invalid responses, unsupported media types,
decoding errors and unrecoverable buffer errors require manual refresh.

MP4 playback remains muted as in the original player. MP4 volume controls
and additional stream measurements are not yet implemented.

See [VAPIX media streaming over HTTP](https://developer.axis.com/vapix/network-video/media-stream-over-http/)
and [SourceBuffer](https://developer.mozilla.org/en-US/docs/Web/API/SourceBuffer).

## RTSP playback

The RTSP modules handle the connection and streaming protocol independently
of the player interface. They do not decode video or audio.

`rtspWebSocket.ts` opens a binary WebSocket to the device. If the handshake
fails, it requests a fresh session token from `rtspwssession.cgi` and
tries once more. Both attempts and the token request share a 20-second
deadline. Closing cancels pending work and releases the connection.

`rtspMessage.ts` separates RTSP commands and replies from media packets,
even when a message arrives in several pieces. It limits incomplete
headers to 32 KiB and RTSP bodies to 1 MiB. These limits do not restrict
the browser's own WebSocket buffers.

`sdp.ts` reads the media description returned by the camera, including
track control URLs, codecs, clock rates and audio channel counts.
Optional frame dimensions preserve compatibility with Axis JPEG
descriptions. A single track may use the description URL if its own
control URL is missing; multiple tracks must have distinct URLs.
The parser preserves whether the camera advertises session-wide control.

`rtspSession.ts` requests the description, sets up the selected tracks
and starts playback. Media handlers receive the negotiated tracks and
playback timing before receiving packets. The session routes packets
using the channel numbers returned by the camera and discards packets
received before PLAY succeeds.

The session waits at most ten seconds for a command reply, or less when
the advertised session timeout is shorter. Keepalive requests use half
the timeout, capped at 30 seconds, measured from the previous command's
send time. If no positive timeout is advertised, use 60 seconds as the
session timeout. Stop and failure cancel timers, attempt TEARDOWN and
close the connection. RTSP response errors retain the numeric status so
the caller can decide whether to retry.

Multiple selected tracks require session-wide control. RTSP command
authentication and separate sessions for individual tracks are not
implemented. The existing Axis playback implementation is still used
until the native media handlers are ready.

See the [VAPIX streaming documentation](https://developer.axis.com/vapix/network-video/video-streaming/),
the [Axis WebSocket implementation](https://github.com/AxisCommunications/media-stream-library-js/blob/v13.3.3/streams/src/components/ws-source/openwebsocket.ts),
[RFC 2326](https://www.rfc-editor.org/rfc/rfc2326.html),
[RFC 3551](https://www.rfc-editor.org/rfc/rfc3551.html) and
[RFC 8866](https://www.rfc-editor.org/rfc/rfc8866.html).

## Client stream information

`StreamStats.tsx` owns the panel and samples metrics once per second while
expanded. `streamStats.ts` formats the available measurements.
The legacy playback adapter reads video track metrics on demand.
HTTP formats show basic stream information; missing measurements are not
estimated. AV1 has its own stream type label.

The panel styling and icon are adapted from
[media-stream-player v13.3.3](https://github.com/AxisCommunications/media-stream-library-js/blob/v13.3.3/player/src/Stats.tsx).
The upstream MIT notice is retained in the root `LICENSE` and
`web/public/LICENSE.axis.txt`, which Vite copies into web builds.

## Overlay geometry

`Dimensions` describes the intrinsic stream resolution and the visible
image rectangle in CSS pixels relative to the outer player container.
Overlays use the visible rectangle, excluding any black bars.

`videoDimensions.ts` calculates the rectangle without reading the DOM.
`videoDimensionObserver.ts` observes the current media element and container,
including intrinsic size changes, and disconnects when either is replaced.
`CustomPlayer` notifies the parent after layout changes, including when the
limiter changes the image position without changing its size.
The media ref remains an object ref because the upstream player invokes
callback refs during render.

## Verification

Run `yarn test`, `yarn lint` and `yarn build` in the `web` directory.
On physical cameras, check:

- Play, Stop, Refresh, all formats, camera, resolution and FPS changes.
- Visibility changes, stream interruption and manual recovery after errors.
- AV1 availability, codec-specific resolutions and saved settings on reload.
- Audio, snapshots, statistics and widget alignment during resize and fullscreen.
- Long-running playback, memory use and latency on supported browsers.

The archived [Axis v13.3.3 source](https://github.com/AxisCommunications/media-stream-library-js/tree/v13.3.3)
is the reference for remaining RTSP behavior. Retain upstream copyright
and MIT notices when adapting code. Remove the two streaming dependencies
only after all original formats have been replaced and tested.
