from langgraph.graph import END, START, StateGraph
from typing_extensions import TypedDict


class SQLAgentState(TypedDict):
    question: str
    answer: str


def answer_question(state: SQLAgentState) -> SQLAgentState:
    return {
        **state,
        "answer": "Replace this node with schema retrieval, SQL generation, validation, and execution.",
    }


def build_sql_agent():
    graph = StateGraph(SQLAgentState)
    graph.add_node("answer_question", answer_question)
    graph.add_edge(START, "answer_question")
    graph.add_edge("answer_question", END)
    return graph.compile()
