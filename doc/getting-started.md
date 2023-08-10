---
layout: doc.liquid
title: getting started
---
# Getting Started

The Gateway is a service to help you use [**m-ld**](https://m-ld.org/), which is a _peer-to-peer_ technology, and so it doesn't need any services! Wait... what?

The trouble is, most networks – including the internet – don't have a standard way to _broadcast_ messages to a group of participants, without using a service. Also, peer-to-peer apps are susceptible to data loss if all the peer devices get dropped in the bath. The Gateway is one way to fill these gaps.

There are plenty of other ways, like using a message bus or a pubsub service, or putting clones on the cloud, which can work just as well. If you're here, you're probably looking for options, and the paragraphs below might describe you. But if they don't, please do [get in touch](http://m-ld.org/hello/).

---

> I'm just getting started with **m-ld**. I want to try building an app, without having to deploy a messaging service.

The Gateway serves free public messaging for **m-ld**! Your domains will be named like `≪uuid≫.public.{{ '{{ domain }}' }}`, and you'll need a network connection to create new domains and keep clones synchronised (although individual clones can work offline, as usual). For usage instructions see [UUID subdomains](uuid-subdomains).

---

> I'm building a client-only browser or desktop app with **m-ld**. I want to offer secure backup of my users' data.

You can sign up for your own free Gateway account, and create domains which are backed up here. Your domains will be named like `≪name≫.≪account≫.{{ '{{ domain }}' }}`, and you'll need an internet connection to create new domains and keep clones synchronised (although individual clones can work offline, as usual). For usage instructions see [named subdomains](named-subdomains).

---

> I'm building an app with a service tier, using **m-ld** for data distribution.

You can use the Gateway to provide messaging and secure backup of your domains. You service tier can just talk to the Gateway as if it were a client. To set your own service levels, or to work with a restricted network, you might choose to [self-host your own Gateway](self-host).

---

> I'm upgrading a legacy app, with a service tier and database, to offer live document sharing using **m-ld**.

Keeping a database in sync with information in **m-ld** requires a dedicated clone, local to the database, which can offer the kind of serialised updates that conventional databases like.

The best deployment approach will be to embed this local clone in your service tier, where it can be animated directly from the application logic. If an engine doesn't exist for your server platform though, you can [deploy a Gateway](self-host) in a "sidecar" arrangement with your services. The Gateway [clone API](clone-api) can be used to provide serialised state to your app, for synchronisation with the database.

> 🚧 More detail on this option will be available here soon. In the meantime, please do [get in touch](http://m-ld.org/hello/) to discuss your use-case!