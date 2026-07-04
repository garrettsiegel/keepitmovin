# CodePass

## Summary

CodePass is a harness that helps users seamlessly move between tools and carrying the context of what they are working on with them.

An example of tools are the following: Claude Code, Codex, Antigravity CLI, Opencode, Ollama local models a user may have.

A user may want to switch tools during working on tasks. Here is an example of my current painpoint: I am working in Claude Code on a task, but I have a use case for part of it that would be better suited for the Codex CLI. If I switch from Claude Code to Codex, nothing carries with it. I lose all context of what I'm working on.

Another example of the pain-point: I am deep in a task working in Claude Code (I have a $20 monthly pro plan) and my 5 hour rate limit gets hit. Now I want to switch to Codex or Antigravity or another tool, but my context of my chats that I've been working on doesn't carry over into that new tool.

CodePass bridges that gap.
The goal is that CodePass is a wrapper or a harness around these tools (a box for them so-to-speak) that keeps a lean "handoff" markdown file for each session. This lean handoff file gets regularly and dynamically updated by the users current tool they are working in, to keep the handoff file aware of what's being worked on and any other important information in the user's chat.

If a user decides to switch tools, or if the user gets rate limited, it switches to another tool and the handoff gets passed to the new tool and the new tool has full access to it because it's in the same harness/box.

The user can choose to switch tools at any time, but upon starting codepass they setup their desired stack.

For example: 
The user chooses 1. Claude Code, 2. Codex, 3. Opencode, 4. Ollama.
If the user chooses manually to change tools - they can choose any tool they'd like from the list of available tools, but if the user is working in Claude Code and they get rate limited by hitting their rate window, the CodePass harness automatically moves the user into the next tool - passing the handoff with them, keeping their momentum moving.

This starts with a CLI. It should be something like installing:
npx (or npm) i codepass

from there, they will get a CLI introduction to the tool and choose their stack. CodePass should make sure that they are using the latest version of the tools upon selecting.

It will prompt the user either to login for paid plans (by a link to login via the terminal) or add their API key if they are using an API.

once logged in, the user's tool will open and they can begin using it just like normally.

There should be a command to switch tools thats present in the cli so that the user can see what that command is at any time.

I would like to know if there is a way to detect the users usage for these tools intead of relying on keywords to detect rate limiting. However, currently it relies on keywords. 

If a user gets rate limited. The user gets a short message, a commercial break so-to-speak (this could be a cool way to add some fun), where the tool gets switched to the next tool. The new tool will be populated with a message that the user has just moved into this tool from the previous and here is the handoff file as a context of what they were working on. Please continue.

I am concerned about the excess tokens this will cost the user on top of their usage, so we need to find a way to keep the token usage of this to a bare minimum.

Right now, lets only focus on optimizing for the following tools:
- claude code
- codex
- antigravity CLI
- opencode
- openrouter
- ollama
- if cline has a CLI that's easy to install add that too

I can add more later if desired.

For all of these tools, CodePass needs to know how to detect if the user has been rate limited.

The CLI should be very simple and understandable, it should use clack for a nice experience. People who aren't devs probably won't use but should be able to understand how to use it. Clear/concise instructions and flow. Help the user along to understand what to do.

The handoff file should be as minimal as possible while making sure key information is dynamically added throughout the users chat. At every stopping point in the user's chat it should determine whether to add anything to the handoff file. I'm not sure the best way to do this but it needs to be minimal and light, not adding a ton of context and/or tokens to the user's experience. What is the best way to handle this? It would be a good idea to do some research and find out.

Handoff files should be saved locally for the user, and there should be an option in the cli settings to clear them if the user desires.

There should be clear and simple instructions/documentation for the user.

the user should simply be able to type in codepass into their terminal once installed and then it will open.

They should have the option like it is currently present to start new or use the previous settings.


The main goal here is to create a seamless experience where i can switch tools and keep my work going without having to redo things and lose context. I want a good user and developer experience.

Keep it very simple, and easy to use. Minimal, anyone should be able to use it with ease.

the code for this project should be minimal, clean, no files should be over 200-250 LOC unless absolutely necessary. no nested functions. easy to understand so that any junior dev can understand what the code does. Concise comments where useful. 

Remove any unnecessary code or files.

Please make sure that the CLAUDE.md and README.md are up to date with the latest information needed.