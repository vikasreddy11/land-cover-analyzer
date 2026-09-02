from app import app  # import your Flask app object

def test_compare(): 
    client = app.test_client()  # this simulates requests without running a server
    response = client.get("/api/compare?lat=17.385&lon=78.486&radius=500&year1=2018&year2=2024")
    print(response.get_json())
    
    assert response.status_code == 200

def test_mock(mocker):
    mocker.patch("app.compare_location",return_value=42)
    client = app.test_client()  # this simulates requests without running a server
    response = client.get("/api/compare?lat=17.385&lon=78.486&radius=500&year1=2018&year2=2024")

    assert response.status_code == 200
    data = response.get_json()
    assert data == 42

def test_year1_after_year2():
    client = app.test_client()
    response = client.get("/api/compare?lat=17.385&lon=78.486&radius=500&year1=2024&year2=2018")
    
    assert response.status_code == 400




def test_less_than_2015():
    client = app.test_client()
    response = client.get("/api/compare?lat=17.385&lon=78.486&radius=500&year1=2010&year2=2018")
    
    assert response.status_code == 400

def test_missing_radius():
    client = app.test_client()
    response = client.get("/api/compare?lat=17.385&lon=78.486&year1=2018&year2=2024")
    # radius is missing on purpose
    
    assert response.status_code == 200

def test_radius_zero():
    client=app.test_client()
    response = client.get("/api/compare?lat=17.385&lon=78.486&radius=0&year1=2010&year2=2018")

    assert response.status_code == 400

def test_radius_limit():
    client=app.test_client()
    response=client.get("/api/compare?lat=17.385&lon=78.486&radius=100000&year1=2010&year2=2018")

    assert response.status_code == 400
