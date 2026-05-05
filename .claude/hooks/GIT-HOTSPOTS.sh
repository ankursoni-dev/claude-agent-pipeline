#!/usr/bin/env bash
# Generates .claude/context/git-hotspots.json with file change frequency data.
# Used by the AUDITOR for priority ordering and by CLASSIFY-RISK for risk-informed routing.
# Zero LLM cost — pure git analysis.

set -e

HOTSPOTS_FILE=".claude/context/git-hotspots.json"
mkdir -p "$(dirname "$HOTSPOTS_FILE")"

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "{\"generated_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"files\": {}, \"top_co_changes\": []}" > "$HOTSPOTS_FILE"
    exit 0
fi

# Temporary file for intermediate data
TEMP_FILE=$(mktemp)
trap "rm -f $TEMP_FILE" EXIT

# Start JSON output
cat > "$HOTSPOTS_FILE" << 'EOF'
{
EOF

echo "  \"generated_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"," >> "$HOTSPOTS_FILE"
echo "  \"files\": {" >> "$HOTSPOTS_FILE"

first_file=true

# Find all .ts files in src/modules/, excluding .spec.ts and .d.ts
for file in $(find src/modules -name "*.ts" -not -name "*.spec.ts" -not -name "*.d.ts" 2>/dev/null | sort); do
    if [ ! -f "$file" ]; then
        continue
    fi

    # Count total commits
    total_commits=$(git log --oneline -- "$file" 2>/dev/null | wc -l)

    # Count recent commits (90 days)
    recent_commits=$(git log --since="90 days ago" --oneline -- "$file" 2>/dev/null | wc -l)

    # Classify: hotspot (total > 50 AND recent > 5), stable (total < 5 AND recent == 0), normal
    classification="normal"
    if [ "$total_commits" -gt 50 ] && [ "$recent_commits" -gt 5 ]; then
        classification="hotspot"
    elif [ "$total_commits" -lt 5 ] && [ "$recent_commits" -eq 0 ]; then
        classification="stable"
    fi

    # Add to JSON (with comma handling)
    if [ "$first_file" = false ]; then
        echo "," >> "$HOTSPOTS_FILE"
    fi
    first_file=false

    cat >> "$HOTSPOTS_FILE" << EOF
    "$file": {
      "total_commits": $total_commits,
      "recent_commits_90d": $recent_commits,
      "classification": "$classification"
    }
EOF
done

echo "" >> "$HOTSPOTS_FILE"
echo "  }," >> "$HOTSPOTS_FILE"

# Generate top co-changes (files that appear together in commits most often)
echo "  \"top_co_changes\": [" >> "$HOTSPOTS_FILE"

# Use git log to find file co-occurrences in the last 6 months
git log --since="6 months ago" --name-only --pretty=format:"---" 2>/dev/null | \
    awk '
        BEGIN {
            RS = "---"
        }
        {
            # Split this commit into lines (files)
            split($0, lines, "\n")

            # For each pair of files in this commit, increment counter
            for (i = 1; i <= length(lines); i++) {
                for (j = i+1; j <= length(lines); j++) {
                    file1 = lines[i]
                    file2 = lines[j]
                    if (file1 ~ /\.ts$/ && file2 ~ /\.ts$/ &&
                        file1 !~ /\.spec\.ts$/ && file2 !~ /\.spec\.ts$/ &&
                        file1 !~ /\.d\.ts$/ && file2 !~ /\.d\.ts$/ &&
                        file1 != "" && file2 != "") {

                        # Sort pair to avoid duplicates (A,B) vs (B,A)
                        if (file1 > file2) {
                            temp = file1; file1 = file2; file2 = temp
                        }

                        pair = file1 "|" file2
                        count[pair]++
                    }
                }
            }
        }
        END {
            # Sort by count descending, take top 10
            n = 0
            for (pair in count) {
                pairs[n] = pair
                counts[n] = count[pair]
                n++
            }

            # Bubble sort to find top 10
            for (i = 0; i < n && i < 10; i++) {
                for (j = i+1; j < n; j++) {
                    if (counts[j] > counts[i]) {
                        tmp_pair = pairs[i]; pairs[i] = pairs[j]; pairs[j] = tmp_pair
                        tmp_count = counts[i]; counts[i] = counts[j]; counts[j] = tmp_count
                    }
                }
            }

            # Output top pairs
            for (i = 0; i < n && i < 10; i++) {
                split(pairs[i], parts, "|")
                print parts[1] "|" parts[2] "|" counts[i]
            }
        }
    ' > "$TEMP_FILE"

first_pair=true
while IFS='|' read -r file1 file2 count; do
    if [ -n "$file1" ] && [ -n "$file2" ]; then
        if [ "$first_pair" = false ]; then
            echo "," >> "$HOTSPOTS_FILE"
        fi
        first_pair=false

        cat >> "$HOTSPOTS_FILE" << EOF
    {
      "files": ["$file1", "$file2"],
      "co_change_count": $count
    }
EOF
    fi
done < "$TEMP_FILE"

echo "" >> "$HOTSPOTS_FILE"
echo "  ]" >> "$HOTSPOTS_FILE"
echo "}" >> "$HOTSPOTS_FILE"

exit 0
