from playwright.sync_api import Page, expect
from utils import extract_table_data

def test_shows_number_of_databases(page: Page):
    page.goto("http://localhost:8080/db")
    expect(page.get_by_text("Databases")).to_have_text("Databases 2")


def test_shows_number_of_tables(page: Page):
    page.goto("http://localhost:8080/db")
    expect(page.get_by_role("row")).to_have_count(3)

    table_data = extract_table_data(page)

    assert table_data == [
        {
            "": "",
            "Name": "db1",
            "Tables": "2",
            "Records": "9",
            "Backups": "0",
            "Last backup": "—",
        },
        {
            "": "",
            "Name": "db2",
            "Tables": "3",
            "Records": "17",
            "Backups": "0",
            "Last backup": "—",
        },
    ]
