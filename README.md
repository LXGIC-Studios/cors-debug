# cors-debug

[![npm version](https://img.shields.io/npm/v/@lxgicstudios/cors-debug.svg)](https://www.npmjs.com/package/@lxgicstudios/cors-debug)
[![license](https://img.shields.io/npm/l/@lxgicstudios/cors-debug.svg)](LICENSE)
[![node](https://img.shields.io/node/v/@lxgicstudios/cors-debug.svg)](package.json)

Debug CORS issues by sending preflight requests and showing full header breakdowns. Test specific origins, methods, and headers. Get fix suggestions with exact server config and understand exactly WHY your CORS requests fail.

Zero external dependencies. Just Node.js built-ins (http/https).

## Install

```bash
# Run directly with npx
npx @lxgicstudios/cors-debug https://api.example.com

# Or install globally
npm install -g @lxgicstudios/cors-debug
```

## Usage

```bash
# Basic CORS check
cors-debug https://api.example.com/data

# Test with a specific origin
cors-debug https://api.example.com --origin https://mysite.com

# Test specific method and headers
cors-debug https://api.example.com --method PUT --header "Authorization"

# Get fix suggestions (Express.js + Nginx configs)
cors-debug https://api.example.com --fix

# Full request/response details
cors-debug https://api.example.com --verbose

# JSON output
cors-debug https://api.example.com --json
```

## What It Does

cors-debug sends the same OPTIONS preflight request your browser would send, then:

1. Shows you every CORS header in the response
2. Tells you exactly what's wrong
3. Explains WHY it'll fail
4. Gives you copy-paste server config to fix it

## Features

- Zero external dependencies
- Sends real OPTIONS preflight requests
- Tests specific origins, methods, and headers
- Explains WHY CORS fails in plain English
- Fix suggestions with Express.js and Nginx configs
- Full header breakdown (`--verbose`)
- JSON output for CI (`--json`)
- Exits with code 1 when CORS is blocked
- Handles HTTPS and HTTP
- Configurable timeout

## Options

| Flag | Description |
|------|-------------|
| `--origin` | Origin to test (default: https://example.com) |
| `--method` | HTTP method to test (default: GET) |
| `--header` | Custom header to include in preflight |
| `--fix` | Show exact server config to fix issues |
| `--verbose` | Show full request and response headers |
| `--json` | Output results as JSON |
| `--timeout` | Request timeout in ms (default: 10000) |
| `--help` | Show help message |

## CORS Headers Explained

| Header | What It Does |
|--------|-------------|
| `Access-Control-Allow-Origin` | Which origins can access the resource |
| `Access-Control-Allow-Methods` | Which HTTP methods are allowed |
| `Access-Control-Allow-Headers` | Which custom headers are allowed |
| `Access-Control-Allow-Credentials` | Whether cookies/auth can be sent |
| `Access-Control-Max-Age` | How long to cache preflight results |
| `Access-Control-Expose-Headers` | Which headers the browser can read |

## Common CORS Issues

**"No Access-Control-Allow-Origin header"** - Your server doesn't send any CORS headers. You need to add them.

**"Origin mismatch"** - The server allows a different origin than yours. Update the allowed origins list.

**"Wildcard with credentials"** - You can't use `*` as the allowed origin when sending cookies. Specify the exact origin.

**"Method not allowed"** - Your HTTP method (PUT, DELETE, etc.) isn't in the allowed methods list.

## License

MIT - Built by [LXGIC Studios](https://github.com/lxgicstudios)
