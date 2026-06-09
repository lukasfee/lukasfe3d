import os
import re

print("Searching for JSX elements matching the CSS nested layout...")

for root, _, files in os.walk("src"):
    for file in files:
        if file.endswith(".tsx"):
            path = os.path.join(root, file)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
                    
                # Find all JSX blocks that contain a div, a span and a p close to each other
                # We can do this by looking for occurrences of <span, <div, and <p within a ~300 character window
                for match in re.finditer(r'(<div[^>]*>|<span[^>]*>|<p[^>]*>)', content):
                    start = max(0, match.start() - 150)
                    end = min(len(content), match.start() + 250)
                    chunk = content[start:end]
                    if "<span" in chunk and "<p" in chunk and "<div" in chunk:
                        # Let's print out the match and its line number in the source file
                        line_num = content[:match.start()].count("\n") + 1
                        print(f"Match found in {path}:{line_num}")
                        # Print some context
                        sub_chunk = content[match.start():match.start()+150].replace('\n', ' ')
                        print(f"  Context: {sub_chunk}...")
            except Exception as e:
                pass
