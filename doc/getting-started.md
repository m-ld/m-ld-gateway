# Getting Started

> I'm just getting started with **m-ld**. I want to try building an app, without having to deploy a messaging service.

We run a free public Socket.io messaging service for **m-ld**, on our cloud Gateway! Your domains will be named like `≪uuid≫.public.gw.m-ld.org`, and you'll need an internet connection to create new domains and keep clones synchronised (although individual clones can work offline, as usual). For usage instructions see [UUID subdomains](uuid-subdomains.md).

---

> I'm building a client-only browser or desktop app with **m-ld**. I want to offer secure backup of my users' data.

On our cloud Gateway you can sign up for your own free account, and create domains which are backed-up there. Your domains will be named like `≪name≫.≪account≫.gw.m-ld.org`, and you'll need an internet connection to create new domains and keep clones synchronised (although individual clones can work offline, as usual). For usage instructions see [named subdomains](named-subdomains.md).

---

> I'm building an app with a service tier, using **m-ld** for data distribution.

You can use our cloud Gateway to provide messaging and secure backup of your domains. You service tier can just talk to the cloud Gateway as if it were a client. To set your own service levels, or to work with a restricted network, you might choose to [self-host your own Gateway](self-host.md).

---

> I'm upgrading a legacy app, with a service tier and database, to offer live document sharing using **m-ld**.

Keeping a database in-sync with information in **m-ld** requires a dedicated clone, local to the database, which can offer the kind of serialised updates that conventional databases like. There are a variety of strategies for this, and we'd be very happy for you to [get in touch](http://m-ld.org/hello/) to discuss them!

The best deployment approach will be to embed this local clone in your service tier, where it can be animated directly from the application logic. If an engine doesn't exist for your server platform though, you can [deploy a **m-ld** Gateway](self-host.md) in a "sidecar" arrangement with your services. The Gateway [clone API](clone-api.md) can be used to provide serialised state to your app, for synchronisation with the database.