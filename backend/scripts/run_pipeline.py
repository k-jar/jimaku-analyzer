"""
Pipeline Runner for Anime Subtitle Analysis
Executes the three-stage processing pipeline:
1. Analyze subtitles and generate stats
2. Enrich stats with ML difficulty predictions
3. Ingest enriched data into database
"""

import sys
import subprocess
import argparse
from pathlib import Path

# Get the correct paths
SCRIPTS_DIR = Path(__file__).parent
PIPELINE_DIR = SCRIPTS_DIR / "pipeline"
PROJECT_ROOT = SCRIPTS_DIR.parent

SCRIPT_1 = PIPELINE_DIR / "1_analyze_subs.py"
SCRIPT_2 = PIPELINE_DIR / "2_enrich_stats.py"
SCRIPT_3 = PIPELINE_DIR / "3_ingest_to_db.py"


class PipelineRunner:
    """Manages the execution of the subtitle analysis pipeline."""

    def __init__(self, verbose=False):
        self.verbose = verbose
        self.steps = [
            {
                "name": "Analyze Subtitles",
                "script": SCRIPT_1,
                "description": "Extracts linguistic features from subtitle files",
            },
            {
                "name": "Enrich with ML Predictions",
                "script": SCRIPT_2,
                "description": "Adds difficulty predictions using trained model",
            },
            {
                "name": "Ingest to Database",
                "script": SCRIPT_3,
                "description": "Loads processed data into the application database",
            },
        ]

    def print_header(self, text, char="="):
        """Print a formatted header."""
        width = 70
        print(f"\n{char * width}")
        print(f"{text:^{width}}")
        print(f"{char * width}\n")

    def run_step(self, step_num, script_path, args=None):
        """Execute a single pipeline step."""
        step = self.steps[step_num - 1]

        self.print_header(f"STEP {step_num}: {step['name']}", "=")
        print(f"Description: {step['description']}")
        print(f"Script: {script_path.name}\n")

        if not script_path.exists():
            print(f" ERROR: Script not found at {script_path}")
            return False

        # Build command
        cmd = [sys.executable, str(script_path)]
        if args:
            cmd.extend(args)

        if self.verbose:
            print(f"Executing: {' '.join(cmd)}\n")

        try:
            result = subprocess.run(
                cmd,
                check=True,
                text=True,
                capture_output=False,  # Show output in real-time
                cwd=str(PROJECT_ROOT),  # Run from project root
            )
            print(f"\n Step {step_num} completed successfully.")
            return True

        except subprocess.CalledProcessError as e:
            print(f"\n Step {step_num} failed with exit code {e.returncode}")
            return False
        except KeyboardInterrupt:
            print(f"\n  Step {step_num} interrupted by user")
            return False
        except Exception as e:
            print(f"\n Unexpected error in step {step_num}: {e}")
            return False

    def run_full_pipeline(self, analyze_all=False, force=False):
        """Run all three steps in sequence."""
        self.print_header("ANIME SUBTITLE ANALYSIS PIPELINE", "=")
        print("This pipeline will:")
        print("  1. Analyze subtitle files and extract linguistic features")
        print("  2. Enrich data with ML-based difficulty predictions")
        print("  3. Ingest processed data into the database\n")

        # Step 1: Analyze Subtitles
        step1_args = []
        if analyze_all:
            step1_args.append("--all")
        if force:
            step1_args.append("--force")

        if not self.run_step(1, SCRIPT_1, step1_args):
            print("\n Pipeline aborted due to failure in step 1")
            return False

        # Step 2: Enrich Stats
        if not self.run_step(2, SCRIPT_2):
            print("\n Pipeline aborted due to failure in step 2")
            return False

        # Step 3: Ingest to DB
        step3_args = []
        if analyze_all:
            step3_args.append("--all")

        if not self.run_step(3, SCRIPT_3, step3_args):
            print("\n Pipeline aborted due to failure in step 3")
            return False

        # Success
        self.print_header("Pipeline completed successfully.", "=")
        print("All steps executed without errors.")
        return True

    def run_from_step(self, start_step, analyze_all=False, force=False):
        """Run pipeline starting from a specific step."""
        if start_step < 1 or start_step > 3:
            print(f" Invalid step number: {start_step}. Must be 1, 2, or 3.")
            return False

        self.print_header(f"RUNNING PIPELINE FROM STEP {start_step}", "=")

        steps_to_run = [
            (
                1,
                SCRIPT_1,
                ["--all"] if analyze_all else [] + (["--force"] if force else []),
            ),
            (2, SCRIPT_2, []),
            (3, SCRIPT_3, ["--all"] if analyze_all else []),
        ]

        for step_num, script, args in steps_to_run[start_step - 1 :]:
            if not self.run_step(step_num, script, args):
                print(f"\n Pipeline aborted due to failure in step {step_num}")
                return False

        self.print_header("Partial pipeline completed.", "=")
        return True


def main():
    parser = argparse.ArgumentParser(
        description="Run the anime subtitle analysis pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Run full pipeline interactively (select series)
  python scripts/run_pipeline.py
  
  # Run full pipeline on all series
  python scripts/run_pipeline.py --all
  
  # Force re-analysis of existing files
  python scripts/run_pipeline.py --all --force
  
  # Run only step 2 and 3 (skip analysis)
  python scripts/run_pipeline.py --from-step 2
  
  # Run only step 3 (ingestion only)
  python scripts/run_pipeline.py --from-step 3 --all
  
  # Show verbose output
  python scripts/run_pipeline.py --all --verbose
        """,
    )

    parser.add_argument(
        "--all",
        action="store_true",
        help="Process all available series (non-interactive mode)",
    )

    parser.add_argument(
        "--force",
        action="store_true",
        help="Force re-processing of existing files in step 1",
    )

    parser.add_argument(
        "--from-step",
        type=int,
        choices=[1, 2, 3],
        metavar="N",
        help="Start pipeline from step N (1=analyze, 2=enrich, 3=ingest)",
    )

    parser.add_argument(
        "--verbose", action="store_true", help="Show detailed execution information"
    )

    args = parser.parse_args()

    # Create runner
    runner = PipelineRunner(verbose=args.verbose)

    # Execute pipeline
    if args.from_step:
        success = runner.run_from_step(
            args.from_step, analyze_all=args.all, force=args.force
        )
    else:
        success = runner.run_full_pipeline(analyze_all=args.all, force=args.force)

    # Exit with appropriate code
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
