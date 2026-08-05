# RFCs

Most changes do not need one. Open a pull request.

An RFC exists for the changes a pull request cannot carry: the ones where the
argument matters more than the diff, and where being wrong is expensive to
undo — because after 1.0 the [stability
policy](https://rxova.org/packages/use-everywhere/under-the-hood/stability/)
means undoing it costs a major version.

## When an RFC is required

- **Renaming or removing anything exported.** Including the "obviously better"
  name.
- **Changing a default.** A default is behaviour; changing one has broken more
  apps than most renames.
- **Changing the wire protocol.** Two builds of an app meet in one browser
  profile, and what happens then is a documented promise.
- **Making a value stricter.** If `set()` starts rejecting something it used to
  accept — even something it always should have — that is a break.
- **A new primitive.** Not a new option on an existing one: a new noun.

## When one is not

Bug fixes. Performance. Docs. New tests. A new option that defaults to today's
behaviour. Anything reversible in a patch.

If you are unsure, open the pull request and say you are unsure. Being told "this
needs an RFC" costs you one comment; writing an RFC nobody needed costs you an
afternoon.

## The process

1. Copy `0000-template.md` to `rfcs/0000-my-change.md` and fill it in.
2. Open a pull request. The number is assigned when it is merged — the pull
   request number is what people refer to in the meantime.
3. **The comment period is two weeks minimum**, and starts when the pull request
   opens. It exists so that people who are not reading the repository daily can
   still object before the decision hardens.
4. The maintainer accepts, rejects, or asks for changes, and writes down why in
   the pull request. A rejected RFC is merged too, with `Status: rejected` — the
   argument is the artefact, and rediscovering it in two years is worse than
   storing it.
5. An accepted RFC is not an implementation. It is permission to write one.

## What an RFC must contain

The template is short on purpose. The parts that matter:

- **What breaks.** Not "this is backwards compatible" — the list of code that
  stops working, and how someone finds out.
- **The migration.** If it is mechanical, say whether a codemod is possible. If
  it is not mechanical, say what the person has to decide.
- **What happens if we do nothing.** Sometimes the honest answer is "very
  little", and that is a result.

## Status

Every RFC carries one, in its front matter:

| Status        | Meaning                                           |
| ------------- | ------------------------------------------------- |
| `draft`       | Being written; comments welcome, nothing decided  |
| `open`        | Comment period running                            |
| `accepted`    | Decided; may or may not be implemented yet        |
| `rejected`    | Decided against, and the reasoning is in the file |
| `implemented` | Shipped, with the version it shipped in           |
| `superseded`  | Replaced by a later RFC, which it links to        |
