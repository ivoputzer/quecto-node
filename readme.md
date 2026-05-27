# `@quecto/*`
The `@quecto` namespace is a collection of minimalist, zero-dependency utilities designed for Node.js and modern ECMAScript runtimes. Named after the SI prefix for $10^{-30}$ (representing the subatomic scale), this ecosystem focuses on highly constrained, single-purpose tools that leverage native platform APIs to keep dependency trees flat.

Rather than adding heavy abstraction layers to your stack, these utilities are designed to be easily read, understood, and integrated with minimal overhead.
<!--
![Packages](https://img.shields.io/badge/dynamic/json?label=Package%20Count&query=$.total&url=https://raw.githubusercontent.com/ivoputzer/quecto-node/main/package.json)
![Version](https://img.shields.io/github/package-json/v/ivoputzer/quecto-node?filename=packages%2Fmy-lib%2Fpackage.json)
[![cd](https://img.shields.io/github/actions/workflow/status/ivoputzer/testbump/cd.yml?style=flat-square&colorB=44CC11)](https://github.com/ivoputzer/testbump/actions/workflows/cd.yml)
[![dependencies](https://img.shields.io/badge/dependencies-none-blue.svg?style=flat-square&colorB=44CC11)](https://github.com/ivoputzer/testbump/blob/main/package.json)
[![style](https://img.shields.io/badge/coding%20style-standard-brightgreen.svg?style=flat-square&colorB=44CC11)](http://standardjs.com)
[![coverage](https://img.shields.io/coveralls/ivoputzer/testbump.svg?style=flat-square&colorB=44CC11)](https://coveralls.io/github/ivoputzer/testbump?branch=master)
[![version](https://img.shields.io/npm/v/testbump.svg?label=version&style=flat-square&colorB=007EC6)](https://www.npmjs.com/package/testbump)
[![node](https://img.shields.io/node/v/testbump?style=flat-square&colorB=007EC6)](https://nodejs.org/docs/v22.16.0/api)
[![license](https://img.shields.io/npm/l/testbump.svg?style=flat-square&colorB=007EC6)](https://spdx.org/licenses/WTFNMFPL)
-->

## The Philosophy
We build tools that don't exist but should, and we tear down things that do exist to make them better.

The `@quecto` namespace is an uncompromising exercise in minimalist systems design. We write software characterized by engineering at a low level, adhering to three unyielding pillars:

### 1. Reliable
Reliability is high-quality performance over a long, continuous horizon of time. It is not a feature you bolt on at the end, nor is it achieved by adding monitoring wrappers. Reliability is the natural, inevitable outcome achieved when you combine the **Simple** with the **Durable**.

### 2. Simple
Simplicity is a design philosophy characterized by engineering at a low level. By leveraging the absolute lowest, most deterministic method available, we systematically eliminate unnecessary failure modes.

#### Simple is distinct from easy.
* *Easy* is reaching for an external npm package to solve a primitive task, adding 500 downstream dependencies to your supply chain.
* *Simple* is mastering native runtime mechanics to solve that same task deterministically in under 100 lines of code.

### 3. Durable
Durable means constructing properly out of high-quality components using skilled labor. Our components are the core, native primitives of modern ECMAScript and Node.js. Our skilled labor is rigorous Test-Driven Development (TDD), extreme programming constraints, immutable contracts, and strict, self-imposed line-count boundaries.

## The Constraints
Every package under the `@quecto` scope operates under absolute constraints:

- **Zero-Dependency Directive:** A package must have exactly `0` upstream operational dependencies. Supply-chain security is treated as an absolute boundary. If you import a `@quecto` utility, you know exactly how many lines of code entered your codebase.
- **The 100-Line Kata:** If a core utility or engine cannot be elegantly and readably implemented in under 100 lines of highly optimized code, the architecture is wrong. We refine, de-duplicate, and compress until only vital structural mechanics remain.
- **Total Isolation:** Utilities must be completely isolated and closed-loop. No module-level global variables, no ambient configurations, and no process-wide event hooks that leak across multiple instances in the same process memory.
- **Platform Harmony:** Work *with* the platform, never over it. The cleanest code is the code you didn't have to write because the engine handles it natively.

#### We try to build jewels, not boulders.

## The Kata Doctrine
Every `@quecto` package serves two purposes.

First, it is a production-ready, zero-dependency utility that you can import and trust. Second, it is a **Kata** (a strictly constrained learning exercise designed to teach you the deepest mechanics of the JavaScript runtime). We believe that installing a package should not rob you of the opportunity to understand how it works. Therefore, alongside `readme.md`, every package in this ecosystem includes a `kata.md`.

A Kata defines the rules, the traps, and the architectural phases required to build the utility from scratch. We challenge you to write it yourself before you look at our source code.

## Proposals
The `@quecto` ecosystem is deliberately highly constrained. We do not accept packages just because they are useful; they must be foundational.

If you have an idea for a primitive that fits our philosophy, we welcome proposals. A valid proposal must define the utility, prove it can be built in under 100 lines without dependencies, and outline the `kata.md` that will teach its underlying mechanics.

To propose a new package, please open an issue using the [Proposal Template](.github/ISSUE_TEMPLATE/package_proposal.md).

## Roadmap
- [ ] [`@quecto/test`](packages/test/readme.md) — A concurrent test runner that can be used as a drop-in replacement for `node:test`. It leverages `AsyncLocalStorage` to cleanly isolate test suites, and logs.
- [ ] [`@quecto/pool`](packages/pool/readme.md) — A Go-style concurrency throttle for iterables and streams. It uses direct microtask hand-offs via `Promise.withResolvers()` to bypass array-shift allocations, executing massive queues with virtually zero memory overhead.

<!--
- [ ] [`@quecto/bump`](packages/bump/readme.md) deterministic semver orchestrator that reads test suite signatures via discrete math to eliminate human error from releases.
- [ ] `@quecto/lazy-pool` — A resource pooling manager (e.g., for database connections or worker threads) that uses a lazy iterator to distribute resources down an asynchronous queue.
- [ ] `@quecto/lazy-batch` — An async-generator-driven buffer utility that consumes an infinite or large stream of data and outputs cleanly sliced, concurrent-ready chunks.
- [ ] `@quecto/lazy-retry` — An exponential backoff engine built using an infinite generator. Allows you to bound, map, and filter your retry delays using native .take() mechanics.
- [ ] `@quecto/signal` — A hyper-lightweight execution gatekeeper (a primitive Semaphore) that allows you to pause, queue, and throttle massive concurrent workloads with zero external logic.
- [ ] `@quecto/pipe` — A functional composition pipeline that works uniformly across synchronous data, async functions, and stream iterators, providing unified middleware execution.
- [ ] `@quecto/trap` — A bulletproof process lifecycle coordinator that catches exit signals (SIGTERM, SIGINT, uncaught exceptions) and runs teardown sequences sequentially before dying.
- [ ] `@quecto/server` — A bare-metal HTTP/HTTPS router built directly over Node’s native HttpServer. Zero dependencies, utilizing raw URL parsing and native routing tables in under 80 lines.
- [ ] `@quecto/sse` — A dead-simple Server-Sent Events handler that turns a standard native HTTP response object into a push-based event emitter stream for real-time UIs.
- [ ] `@quecto/fetch-retry` — A wrapper over the native global fetch API that automatically chains with your backoff logic to handle network blips natively.
- [ ] `@quecto/args` — The modern evolution of your 2017 recursive parser. Tail-recursive, zero regular expressions, typing flags and casting booleans purely using array windows.
- [ ] `@quecto/env` — A strictly defensive environment variable loader. It extracts process.env, validates formats, casts types, and explicitly throws fatal errors if a production key is missing.
- [ ] `@quecto/cache` — A memory-isolated Least Recently Used (LRU) cache built entirely on top of JavaScript's native Map object, automatically pruning expired or overflow keys.
- [ ] `@quecto/log` — A fast, structured JSON logger that writes to process.stdout using pre-serialized metadata templates, bypassing the performance penalties of heavy logging frameworks.


What to Drop or Consolidate:
Drop/Merge the lazy-* packages: You have @quecto/lazy-pool, @quecto/lazy-batch, and @quecto/lazy-retry. Having three separate packages for lazy evaluation violates your own rule: "We refine, de-duplicate, and compress." Combine these into a single @quecto/stream or @quecto/lazy package that exposes three focused generator functions.
Drop @quecto/fetch-retry: If you build @quecto/lazy-retry (or a unified stream package), you shouldn't need a dedicated fetch wrapper. Native fetch combined with your retry generator should naturally solve this. Don't build wrappers; build primitives.

Re-think @quecto/bump: Doing git-tag reading, semver parsing, file writing, and changelog generation in under 100 lines is near-impossible without writing unreadable code. If you keep this, scope it strictly to semver math (e.g., passing in two strings and an array of commits to return a new string).

What to Keep (These are perfect fits):
- @quecto/trap, @quecto/args, @quecto/server, @quecto/sse, @quecto/cache, @quecto/pool. These are classic computer science problems that make phenomenal Kata exercises.

What is Missing (Ideas to add):
- @quecto/fsm — A hyper-minimalist Finite State Machine. Managing UI or process state with native Maps and strict transitions. Excellent kata for teaching graph traversal and immutable state.

- @quecto/bus (or @quecto/emitter) — A modern, strict Pub/Sub message bus using pure Map and Set primitives, skipping the legacy bloat of Node's EventEmitter.

-->

## License
[WTFNMFPL](https://spdx.org/licenses/WTFNMFPL)
