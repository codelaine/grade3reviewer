import json
import os
import random
from datetime import date, datetime
from flask import Flask, render_template, request, jsonify, session

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev-only-fallback-change-in-production")


def load_json(filename):
    path = os.path.join(os.path.dirname(__file__), "data", filename)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


topic_groups = load_json("topics.json")["topics"]
TOPICS = [
    {**topic, "subject": subject}
    for subject, topics in topic_groups.items()
    for topic in topics
]

QUESTIONS = load_json("questions.json")["questions"]

MAX_QUESTIONS_PER_LESSON = 12


def get_questions_for_topic(topic_id):
    """
    Support both the new direct topic IDs and the older '-1' naming style
    for backward compatibility.
    """
    if topic_id in QUESTIONS:
        return QUESTIONS[topic_id]

    legacy_key = f"{topic_id}-1"
    if legacy_key in QUESTIONS:
        return QUESTIONS[legacy_key]

    return []


def init_session():
    if "streak" not in session:
        session["streak"] = 0
    if "last_activity" not in session:
        session["last_activity"] = None
    if "completed_topics" not in session:
        session["completed_topics"] = []
    if "total_stars" not in session:
        session["total_stars"] = 0
    if "lessons_today" not in session:
        session["lessons_today"] = 0
    if "lessons_today_date" not in session:
        session["lessons_today_date"] = str(date.today())


def update_streak():
    today = str(date.today())
    last = session.get("last_activity")

    if session.get("lessons_today_date") != today:
        session["lessons_today"] = 0
        session["lessons_today_date"] = today

    if last is None:
        session["streak"] = 1
        session["last_activity"] = today
    elif last == today:
        pass
    else:
        last_date = datetime.strptime(last, "%Y-%m-%d").date()
        today_date = date.today()
        if (today_date - last_date).days == 1:
            session["streak"] += 1
        else:
            session["streak"] = 1
        session["last_activity"] = today

    session["lessons_today"] = session.get("lessons_today", 0) + 1
    session.modified = True


@app.route("/")
def home():
    init_session()
    completed = session.get("completed_topics", [])

    topics_with_status = [
        {
            **topic,
            "completed": topic["id"] in completed,
            "question_count": min(
                len(get_questions_for_topic(topic["id"])), 
                MAX_QUESTIONS_PER_LESSON
            ),
        }
        for topic in TOPICS
    ]

    # Group by subject key, preserving the order of first appearance
    subject_groups = {}
    for topic in topics_with_status:
        subject = topic.get("subject", "general")
        subject_groups.setdefault(subject, []).append(topic)

    grouped_subjects = [
        {
            "key": subject,
            "label": subject.replace("-", " ").title(),
            "topics": topics,
        }
        for subject, topics in subject_groups.items()
    ]

    return render_template(
        "home.html",
        subject_groups=grouped_subjects,
        streak=session["streak"],
        total_stars=session["total_stars"],
        lessons_today=session.get("lessons_today", 0),
    )


@app.route("/lesson/<topic_id>")
def lesson(topic_id):
    init_session()
    topic = next((t for t in TOPICS if t["id"] == topic_id), None)
    if not topic:
        return render_template("404.html"), 404

    all_questions = get_questions_for_topic(topic_id)
    random.shuffle(all_questions)
    questions = all_questions[:MAX_QUESTIONS_PER_LESSON]

    return render_template(
        "lesson.html",
        topic=topic,
        questions=questions,
        streak=session["streak"],
        total_stars=session["total_stars"],
    )


@app.route("/api/complete_lesson", methods=["POST"])
def complete_lesson():
    init_session()
    data = request.get_json()
    topic_id = data.get("topic_id")
    correct = data.get("correct", 0)
    total = data.get("total", 0)
    stars_earned = _calc_stars(correct, total)

    update_streak()

    completed = session.get("completed_topics", [])
    if topic_id not in completed:
        completed.append(topic_id)
        session["completed_topics"] = completed

    session["total_stars"] = session.get("total_stars", 0) + stars_earned
    session.modified = True

    return jsonify({
        "streak": session["streak"],
        "total_stars": session["total_stars"],
        "stars_earned": stars_earned,
        "correct": correct,
        "total": total,
    })


@app.route("/api/session_data")
def session_data():
    init_session()
    return jsonify({
        "streak": session["streak"],
        "total_stars": session["total_stars"],
        "completed_topics": session["completed_topics"],
        "lessons_today": session.get("lessons_today", 0),
    })


@app.route("/api/reset")
def reset_session():
    session.clear()
    return jsonify({"status": "ok"})


def _calc_stars(correct, total):
    if total == 0:
        return 0
    pct = correct / total
    if pct >= 0.9:
        return 3
    elif pct >= 0.6:
        return 2
    else:
        return 1


if __name__ == "__main__":
    app.run(debug=True)