<pre></pre>
<!--suppress HtmlDeprecatedAttribute -->
<p align="center">
  <a href="https://m-ld.org/">
    <picture>
      <!--suppress HtmlUnknownTarget -->
      <source media="(prefers-color-scheme: light)" srcset="https://m-ld.org/m-ld.svg"/>
      <!--suppress HtmlUnknownTarget -->
      <source media="(prefers-color-scheme: dark)" srcset="https://m-ld.org/m-ld.inverse.svg"/>
      <img alt="m-ld" src="https://m-ld.org/m-ld.svg" width="300em" />
    </picture>
  </a>
</p>
<pre></pre>

[![Project Status: WIP – Initial development is in progress, but there has not yet been a stable, usable release suitable for the public.](https://www.repostatus.org/badges/latest/wip.svg)](https://www.repostatus.org/#wip)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/m-ld/m-ld-gateway/node.js.yml?branch=main)](https://github.com/m-ld/m-ld-js/actions)
[![Gitter](https://img.shields.io/gitter/room/m-ld/community)](https://gitter.im/m-ld/community)
[![GitHub Discussions](https://img.shields.io/github/discussions/m-ld/m-ld-spec)](https://github.com/m-ld/m-ld-spec/discussions)

# m-ld Gateway

The Gateway is an open source service that provides secure message delivery
and durable storage of data, for collaborative web apps using [**m-ld**](https://m-ld.org/).

It can be used as:
- 📨 A **message relay server**, so apps don't have to deploy a message broker or other pub-sub system.
- 🗄 A **backup data store** for **m-ld** domains, so an app doesn't have to provide durable persistence of its own.
- 📠 A **"sidecar" container** of **m-ld** domains for server-based environments which not have a native **m-ld** engine.
- 🧱 A building block for **custom gateway services** dedicated to specific apps.

[Let's get started.](doc/getting-started.md)