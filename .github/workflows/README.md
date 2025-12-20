# Build Widget Wizard - CI / Release Workflow

## Purpose

This workflow builds the Widget Wizard ACAP application for 64-bit ARM (aarch64)
using the Axis ACAP SDK inside Docker, packages it into a `.eap` file, and
publishes that file to a GitHub Release associated with a version tag.

It is designed to be:

- Deterministic
- Safe for rebuilding old versions
- Explicit about release promotion
- Suitable for long-term maintenance

## When the workflow runs

### Automatic trigger on tag push when a Git tag is pushed (for example `1.2.3`)

- The workflow builds that exact version
- A GitHub Release is created or updated for that tag
- The release is marked as "Latest"

### Manual trigger: workflow_dispatch

The workflow can also be started manually from the GitHub Actions UI.

Manual inputs:

- tag_name
  The existing Git tag to build
- make_latest
  If set to "true", this release is explicitly marked as "Latest"

Manual runs are typically used for:

- Rebuilding old tags
- Re-publishing an existing release
- Explicitly overriding which release is marked as "Latest"

## High-level workflow steps

1) Determine the tag to build
   - Uses the pushed tag for automatic runs
   - Uses the provided tag_name for manual runs

2) Validate the tag format
   - Tags are expected to follow the x.y.z format
   - Prevents accidental builds from malformed tags

3) Decide release metadata
   - Always publishes under the real version tag
   - Automatically marks tag-push builds as "Latest"
   - Allows manual runs to explicitly control the "Latest" flag

4) Check out the repository
   - Checks out the repository at the exact tag
   - Ensures the build matches the tagged source

5) Build the Docker image
   - Uses docker/Dockerfile
   - Contains the Axis ACAP SDK and Node.js for the web frontend

6) Build the ACAP application
   - Runs the build inside Docker
   - Produces a .eap package in the repository root

7) Publish the release
   - Creates or updates the GitHub Release for the tag
   - Uploads the .eap file as a release asset
   - Marks the release as "Latest" according to the rules above

## Concurrency and safety guarantees

- Builds for the same tag cannot run concurrently
- Prevents release metadata and asset corruption
- Manual rebuilds of older tags do not affect newer releases unless explicitly requested

## Maintenance notes

- The Dockerfile and build scripts define the build environment
- Node.js is used only at build time for the web frontend
- The workflow assumes exactly one .eap file is produced per build
- Changing the .eap output location or name requires updating the workflow
