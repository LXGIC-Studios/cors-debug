#!/usr/bin/env node

import * as http from 'http';
import * as https from 'https';
import * as url from 'url';

// ANSI colors
const c = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  bgRed: (s: string) => `\x1b[41m\x1b[37m${s}\x1b[0m`,
  bgGreen: (s: string) => `\x1b[42m\x1b[37m${s}\x1b[0m`,
  bgYellow: (s: string) => `\x1b[43m\x1b[30m${s}\x1b[0m`,
};

interface CorsResult {
  url: string;
  origin: string;
  method: string;
  statusCode: number;
  headers: Record<string, string>;
  issues: CorsIssue[];
  passes: string[];
}

interface CorsIssue {
  header: string;
  problem: string;
  fix: string;
  severity: 'error' | 'warning' | 'info';
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        args[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        args[arg.slice(2)] = argv[i + 1];
        i++;
      } else {
        args[arg.slice(2)] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  if (positional.length > 0) args['_url'] = positional[0];
  return args;
}

function showHelp(): void {
  console.log(`
${c.bold(c.cyan('cors-debug'))} - Debug CORS issues with preflight request analysis

${c.bold('USAGE')}
  ${c.green('npx @lxgicstudios/cors-debug')} <url> [options]

${c.bold('EXAMPLES')}
  ${c.dim('# Basic CORS check')}
  ${c.green('cors-debug https://api.example.com/data')}

  ${c.dim('# Test with specific origin')}
  ${c.green('cors-debug https://api.example.com --origin https://mysite.com')}

  ${c.dim('# Test specific method and headers')}
  ${c.green('cors-debug https://api.example.com --method PUT --header "Authorization"')}

  ${c.dim('# Get fix suggestions')}
  ${c.green('cors-debug https://api.example.com --fix')}

  ${c.dim('# Full request/response details')}
  ${c.green('cors-debug https://api.example.com --verbose')}

  ${c.dim('# JSON output')}
  ${c.green('cors-debug https://api.example.com --json')}

${c.bold('OPTIONS')}
  ${c.yellow('--origin')}          Origin to test (default: https://example.com)
  ${c.yellow('--method')}          HTTP method to test (default: GET)
  ${c.yellow('--header')}          Custom header to test (repeatable)
  ${c.yellow('--fix')}             Show exact headers to fix CORS issues
  ${c.yellow('--verbose')}         Show full request/response
  ${c.yellow('--json')}            Output results as JSON
  ${c.yellow('--timeout')}         Request timeout in ms (default: 10000)
  ${c.yellow('--help')}            Show this help message

${c.bold('WHAT IS CORS?')}
  Cross-Origin Resource Sharing (CORS) lets servers say which
  origins can access their resources. When your browser blocks a
  request, it's because the server didn't send the right headers.

  This tool sends the same preflight (OPTIONS) request your browser
  would send, then shows you exactly what's missing and how to fix it.

${c.dim('Built by LXGIC Studios - https://github.com/lxgicstudios/cors-debug')}
`);
}

function makeRequest(
  targetUrl: string,
  method: string,
  headers: Record<string, string>,
  timeout: number
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const mod = parsed.protocol === 'https:' ? https : http;

    const options: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers,
      timeout,
    };

    const req = mod.request(options, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      res.on('end', () => {
        const responseHeaders: Record<string, string> = {};
        for (const [key, val] of Object.entries(res.headers)) {
          responseHeaders[key.toLowerCase()] = Array.isArray(val) ? val.join(', ') : (val || '');
        }
        resolve({
          statusCode: res.statusCode || 0,
          headers: responseHeaders,
          body,
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    req.end();
  });
}

function analyzeCors(
  targetUrl: string,
  origin: string,
  method: string,
  customHeaders: string[],
  preflightResponse: { statusCode: number; headers: Record<string, string> },
  actualResponse: { statusCode: number; headers: Record<string, string> } | null
): CorsResult {
  const h = preflightResponse.headers;
  const issues: CorsIssue[] = [];
  const passes: string[] = [];

  // Check Access-Control-Allow-Origin
  const allowOrigin = h['access-control-allow-origin'];
  if (!allowOrigin) {
    issues.push({
      header: 'Access-Control-Allow-Origin',
      problem: 'Missing entirely. The server doesn\'t include this header, so no cross-origin request will work.',
      fix: `Access-Control-Allow-Origin: ${origin}`,
      severity: 'error',
    });
  } else if (allowOrigin === '*') {
    passes.push('Access-Control-Allow-Origin: * (allows all origins)');
    // Check if credentials are also requested
    if (h['access-control-allow-credentials'] === 'true') {
      issues.push({
        header: 'Access-Control-Allow-Origin',
        problem: 'Can\'t use wildcard (*) with credentials. When Access-Control-Allow-Credentials is true, you must specify the exact origin.',
        fix: `Access-Control-Allow-Origin: ${origin}`,
        severity: 'error',
      });
    }
  } else if (allowOrigin === origin) {
    passes.push(`Access-Control-Allow-Origin: ${origin} (matches your origin)`);
  } else {
    issues.push({
      header: 'Access-Control-Allow-Origin',
      problem: `Server allows "${allowOrigin}" but your origin is "${origin}". These don't match.`,
      fix: `Access-Control-Allow-Origin: ${origin}`,
      severity: 'error',
    });
  }

  // Check Access-Control-Allow-Methods
  const allowMethods = h['access-control-allow-methods'];
  if (!allowMethods) {
    if (method !== 'GET' && method !== 'HEAD' && method !== 'POST') {
      issues.push({
        header: 'Access-Control-Allow-Methods',
        problem: `Missing. Your ${method} request needs this header since it's not a "simple" method.`,
        fix: `Access-Control-Allow-Methods: ${method}, GET, POST, OPTIONS`,
        severity: 'error',
      });
    } else {
      passes.push(`Using simple method ${method} (no Access-Control-Allow-Methods needed)`);
    }
  } else {
    const methods = allowMethods.split(',').map(m => m.trim().toUpperCase());
    if (methods.includes(method) || methods.includes('*')) {
      passes.push(`Access-Control-Allow-Methods includes ${method}`);
    } else {
      issues.push({
        header: 'Access-Control-Allow-Methods',
        problem: `Server allows [${methods.join(', ')}] but you're requesting ${method}.`,
        fix: `Access-Control-Allow-Methods: ${[...methods, method].join(', ')}`,
        severity: 'error',
      });
    }
  }

  // Check Access-Control-Allow-Headers
  const allowHeaders = h['access-control-allow-headers'];
  const nonSimpleHeaders = customHeaders.filter(h => {
    const lower = h.toLowerCase();
    return !['accept', 'accept-language', 'content-language', 'content-type'].includes(lower);
  });

  if (nonSimpleHeaders.length > 0) {
    if (!allowHeaders) {
      issues.push({
        header: 'Access-Control-Allow-Headers',
        problem: `Missing. Your request uses custom headers [${nonSimpleHeaders.join(', ')}] that need to be explicitly allowed.`,
        fix: `Access-Control-Allow-Headers: ${nonSimpleHeaders.join(', ')}`,
        severity: 'error',
      });
    } else {
      const allowed = allowHeaders.split(',').map(h => h.trim().toLowerCase());
      const notAllowed = nonSimpleHeaders.filter(h => !allowed.includes(h.toLowerCase()) && !allowed.includes('*'));
      if (notAllowed.length > 0) {
        issues.push({
          header: 'Access-Control-Allow-Headers',
          problem: `Server allows [${allowed.join(', ')}] but you need [${notAllowed.join(', ')}].`,
          fix: `Access-Control-Allow-Headers: ${[...allowed, ...notAllowed].join(', ')}`,
          severity: 'error',
        });
      } else {
        passes.push(`Access-Control-Allow-Headers includes all requested headers`);
      }
    }
  }

  // Check Access-Control-Allow-Credentials
  const allowCredentials = h['access-control-allow-credentials'];
  if (allowCredentials === 'true') {
    passes.push('Access-Control-Allow-Credentials: true (cookies/auth will be sent)');
  }

  // Check Access-Control-Max-Age
  const maxAge = h['access-control-max-age'];
  if (maxAge) {
    const seconds = parseInt(maxAge);
    if (seconds < 60) {
      issues.push({
        header: 'Access-Control-Max-Age',
        problem: `Preflight cache is only ${seconds}s. This means lots of extra OPTIONS requests.`,
        fix: 'Access-Control-Max-Age: 86400',
        severity: 'info',
      });
    } else {
      passes.push(`Access-Control-Max-Age: ${seconds}s (preflight cached)`);
    }
  } else {
    issues.push({
      header: 'Access-Control-Max-Age',
      problem: 'Not set. Each preflight request adds latency. Cache it to speed things up.',
      fix: 'Access-Control-Max-Age: 86400',
      severity: 'info',
    });
  }

  // Check Access-Control-Expose-Headers
  const exposeHeaders = h['access-control-expose-headers'];
  if (exposeHeaders) {
    passes.push(`Access-Control-Expose-Headers: ${exposeHeaders}`);
  }

  // Check preflight status code
  if (preflightResponse.statusCode !== 204 && preflightResponse.statusCode !== 200) {
    issues.push({
      header: 'Status Code',
      problem: `Preflight returned ${preflightResponse.statusCode}. OPTIONS should return 200 or 204.`,
      fix: 'Return 200 or 204 for OPTIONS requests',
      severity: preflightResponse.statusCode >= 400 ? 'error' : 'warning',
    });
  } else {
    passes.push(`Preflight status: ${preflightResponse.statusCode} OK`);
  }

  // Check Vary header
  const vary = h['vary'];
  if (allowOrigin && allowOrigin !== '*' && (!vary || !vary.toLowerCase().includes('origin'))) {
    issues.push({
      header: 'Vary',
      problem: 'Missing Vary: Origin. Without this, intermediate caches may serve wrong CORS headers.',
      fix: 'Vary: Origin',
      severity: 'warning',
    });
  }

  return {
    url: targetUrl,
    origin,
    method,
    statusCode: preflightResponse.statusCode,
    headers: preflightResponse.headers,
    issues,
    passes,
  };
}

function printResult(result: CorsResult, verbose: boolean, showFix: boolean): void {
  console.log('');
  console.log(c.bold(c.cyan('  cors-debug')) + c.dim(' v1.0.0'));
  console.log('');
  console.log(c.bold('  Target: ') + result.url);
  console.log(c.bold('  Origin: ') + result.origin);
  console.log(c.bold('  Method: ') + result.method);
  console.log(c.bold('  Status: ') + (result.statusCode >= 400 ? c.red(String(result.statusCode)) : c.green(String(result.statusCode))));
  console.log('');

  // Verdict
  const errors = result.issues.filter(i => i.severity === 'error');
  if (errors.length === 0) {
    console.log(c.bgGreen(' CORS OK ') + ' Your request should work!');
  } else {
    console.log(c.bgRed(' CORS BLOCKED ') + ` ${errors.length} issue(s) will block this request`);
  }
  console.log('');

  // Issues
  if (result.issues.length > 0) {
    console.log(c.bold('  Issues'));
    for (const issue of result.issues) {
      const icon = issue.severity === 'error' ? c.red('x') : issue.severity === 'warning' ? c.yellow('!') : c.cyan('i');
      console.log(`  ${icon} ${c.bold(issue.header)}`);
      console.log(`    ${issue.problem}`);
      if (showFix) {
        console.log(`    ${c.green('Fix:')} ${issue.fix}`);
      }
      console.log('');
    }
  }

  // Passes
  if (result.passes.length > 0) {
    console.log(c.bold('  Passing'));
    for (const pass of result.passes) {
      console.log(`  ${c.green('+')} ${pass}`);
    }
    console.log('');
  }

  // Verbose: show all headers
  if (verbose) {
    console.log(c.bold('  Response Headers'));
    for (const [key, val] of Object.entries(result.headers)) {
      const isCorHeader = key.startsWith('access-control');
      console.log(`  ${isCorHeader ? c.cyan(key) : c.dim(key)}: ${val}`);
    }
    console.log('');
  }

  // Fix suggestions
  if (showFix && errors.length > 0) {
    console.log(c.bold('  Server Configuration Fix'));
    console.log(c.dim('  Add these headers to your server response for OPTIONS requests:'));
    console.log('');

    // Express.js
    console.log(c.bold('  Express.js:'));
    console.log(c.dim('  app.use((req, res, next) => {'));
    for (const issue of result.issues.filter(i => i.severity === 'error')) {
      console.log(c.green(`    res.header('${issue.header}', '${issue.fix.split(': ').slice(1).join(': ')}');`));
    }
    console.log(c.dim('    if (req.method === "OPTIONS") return res.sendStatus(204);'));
    console.log(c.dim('    next();'));
    console.log(c.dim('  });'));
    console.log('');

    // Nginx
    console.log(c.bold('  Nginx:'));
    console.log(c.dim('  location / {'));
    for (const issue of result.issues.filter(i => i.severity === 'error')) {
      console.log(c.green(`    add_header '${issue.header}' '${issue.fix.split(': ').slice(1).join(': ')}';`));
    }
    console.log(c.dim('    if ($request_method = OPTIONS) { return 204; }'));
    console.log(c.dim('  }'));
    console.log('');
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args['help']) {
    showHelp();
    process.exit(0);
  }

  const targetUrl = args['_url'] as string;
  if (!targetUrl) {
    console.error(c.red('Error: URL is required.'));
    console.error(c.dim('Usage: cors-debug <url> [options]'));
    console.error(c.dim('Run cors-debug --help for more info.'));
    process.exit(1);
  }

  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    console.error(c.red(`Error: Invalid URL: ${targetUrl}`));
    console.error(c.dim('Make sure to include the protocol (https://)'));
    process.exit(1);
  }

  const origin = (args['origin'] as string) || 'https://example.com';
  const method = ((args['method'] as string) || 'GET').toUpperCase();
  const customHeaders = args['header'] ? [args['header'] as string] : [];
  const verbose = !!args['verbose'];
  const showFix = !!args['fix'];
  const jsonOutput = !!args['json'];
  const timeout = parseInt((args['timeout'] as string) || '10000');

  // Build preflight request headers
  const preflightHeaders: Record<string, string> = {
    'Origin': origin,
    'Access-Control-Request-Method': method,
    'User-Agent': 'cors-debug/1.0.0',
  };

  if (customHeaders.length > 0) {
    preflightHeaders['Access-Control-Request-Headers'] = customHeaders.join(', ');
  }

  try {
    if (!jsonOutput) {
      console.log('');
      console.log(c.dim('  Sending OPTIONS preflight request...'));
    }

    // Send preflight OPTIONS request
    const preflightRes = await makeRequest(targetUrl, 'OPTIONS', preflightHeaders, timeout);

    // Optionally send the actual request too
    let actualRes = null;
    if (verbose) {
      const actualHeaders: Record<string, string> = {
        'Origin': origin,
        'User-Agent': 'cors-debug/1.0.0',
      };
      for (const h of customHeaders) {
        actualHeaders[h] = 'cors-debug-test';
      }
      try {
        actualRes = await makeRequest(targetUrl, method, actualHeaders, timeout);
      } catch {
        // Actual request might fail, that's ok
      }
    }

    const result = analyzeCors(targetUrl, origin, method, customHeaders, preflightRes, actualRes);

    if (jsonOutput) {
      console.log(JSON.stringify({
        url: result.url,
        origin: result.origin,
        method: result.method,
        preflightStatus: result.statusCode,
        corsAllowed: result.issues.filter(i => i.severity === 'error').length === 0,
        issues: result.issues,
        passes: result.passes,
        headers: result.headers,
      }, null, 2));
    } else {
      printResult(result, verbose, showFix);
    }

    // Exit with error code if CORS is blocked
    if (result.issues.some(i => i.severity === 'error')) {
      process.exit(1);
    }

  } catch (err: any) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: err.message }, null, 2));
    } else {
      console.error('');
      console.error(c.red(`  Error: ${err.message}`));
      console.error('');
      if (err.code === 'ENOTFOUND') {
        console.error(c.dim('  Could not resolve the hostname. Check the URL and try again.'));
      } else if (err.code === 'ECONNREFUSED') {
        console.error(c.dim('  Connection refused. Is the server running?'));
      } else if (err.message.includes('timeout')) {
        console.error(c.dim('  Request timed out. Try increasing --timeout.'));
      }
      console.error('');
    }
    process.exit(1);
  }
}

main();
