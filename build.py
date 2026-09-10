import os
import re
import subprocess
import sys

base_dir = os.path.dirname(os.path.abspath(__file__))
dev_html_path = os.path.join(base_dir, "index.dev.html")
prod_html_path = os.path.join(base_dir, "index.html")
test_script_path = os.path.join(base_dir, "test_site.js")

if not os.path.exists(dev_html_path):
    print(f"Error: {dev_html_path} does not exist!")
    sys.exit(1)

with open(dev_html_path, "r", encoding="utf-8") as f:
    dev_content = f.read()

def minify_html(raw_html):
    s = re.sub(r'<!--[\s\S]*?-->', '', raw_html)
    
    def min_css(match):
        css = match.group(1)
        css = re.sub(r'/\*[\s\S]*?\*/', '', css)
        css = re.sub(r'\s+', ' ', css)
        css = re.sub(r'\s*([\{\}\:\;\,\>])\s*', r'\1', css)
        css = css.replace(';}', '}')
        return f'<style>{css.strip()}</style>'

    s = re.sub(r'<style>([\s\S]*?)</style>', min_css, s)
    
    def min_js(match):
        js = match.group(1)
        js = re.sub(r'/\*[\s\S]*?\*/', '', js)
        lines = []
        for line in js.splitlines():
            line_str = line.strip()
            if line_str.startswith('//'):
                continue
            lines.append(line)
        js = '\n'.join(lines)
        return f'<script>{js.strip()}</script>'

    s = re.sub(r'<script>([\s\S]*?)</script>', min_js, s)
    s = re.sub(r'>\s+<', '><', s)
    s = re.sub(r'\n\s+', '\n', s)
    return s.strip()

prod_content = minify_html(dev_content)

with open(prod_html_path, "w", encoding="utf-8") as f:
    f.write(prod_content)

print(f"Build complete:")
print(f"  - index.dev.html: {len(dev_content):,} bytes")
print(f"  - index.html:     {len(prod_content):,} bytes")

if os.path.exists(test_script_path):
    print("\nRunning automated test suite (node test_site.js)...")
    res = subprocess.run(["node", test_script_path], cwd=base_dir)
    if res.returncode != 0:
        print("❌ BUILD FAILED: Automated tests failed.")
        sys.exit(res.returncode)
    else:
        print("✅ ALL TESTS PASSED.")
