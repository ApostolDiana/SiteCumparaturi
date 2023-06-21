const cookieParser = require('cookie-parser');
const express = require('express');
const session = require('express-session');
var mysql = require('mysql');

const expressLayouts = require('express-ejs-layouts');
const bodyParser = require('body-parser')
const app = express();

//Mapare pt a urmari nr de incercari resurse inexistente
const blockedUsers = {}; 
const blockDuration = 5 * 1000; 
app.use(cookieParser());
app.use(cookieParser());

app.use(cookieParser());
app.use(session({
  secret: 'secret-key', // Cheia secretă pentru semnarea sesiunii
  resave: false,
  saveUninitialized: true
}));


const port = 6789;
// directorul 'views' va conține fișierele .ejs (html + js executat la server)
app.set('view engine', 'ejs');
// suport pentru layout-uri - implicit fișierul care reprezintă template-ul site-ului este views / layout.ejs
app.use(expressLayouts);
// directorul 'public' va conține toate resursele accesibile direct de către client(e.g., fișiere css, javascript, imagini)
app.use(express.static('public'))
// corpul mesajului poate fi interpretat ca json; datele de la formular se găsesc înformat json în req.body
app.use(bodyParser.json());
// utilizarea unui algoritm de deep parsing care suportă obiecte în obiecte
app.use(bodyParser.urlencoded({ extended: true }));
// la accesarea din browser adresei http://localhost:6789/ se va returna textul 'HelloWorld'
// proprietățile obiectului Request - req - https://expressjs.com/en/api.html#req
// proprietățile obiectului Response - res - https://expressjs.com/en/api.html#res

// la accesarea din browser adresei http://localhost:6789/chestionar se va apela funcția specificată
const fs = require('fs');
var listaIntrebari = [];
//Middleware pt urmarirea accesului la resursele inexistente
app.use((req, res, next) => {
  const ipAddress = req.ip;
  const requestedResource = req.path;

  // Verifică dacă resursa cerută există
  const resourceExists = checkResourceExists(requestedResource);

  if (!resourceExists) {
    blockUser(ipAddress,1);
    logInvalidAccess(ipAddress, requestedResource);
  }

  if (isBlocked(ipAddress)) {
      return res.status(403).send('Accesul este blocat temporar. Vă rugăm încercați mai târziu.');
  }

  next();
});

function checkResourceExists(resource) {
  const resources = [
    '/',
    '/chestionar',
    '/rezultat-chestionar',
    '/autentificare',
    '/deconectare',
    '/creare-bd',
    '/inserare-bd',
    '/verificare-autentificare',
    '/adaugare_cos',
    '/vizualizare_cos',
    '/admin',
    '/stergere_cos'
  ];
  return resources.includes(resource);
}

function logInvalidAccess(ipAddress, resource) {
  console.log(`Încercare de accesare a resursei inexistente: Adresa IP - ${ipAddress}, Resursa - ${resource}`);
}


function isBlocked(ipAddress) {
  const blockedUser = blockedUsers[ipAddress];
  
  if (blockedUser && blockedUser.blockedUntil > Date.now()) {
    return true; 
  } else {
    delete blockedUsers[ipAddress];
    return false;
  }
}
function blockUser(ipAddress, numarIncercari) {
  blockedUsers[ipAddress] = {
    blockedUntil: Date.now() + blockDuration + (numarIncercari*1000) 
  };
}

fs.readFile('./intrebari.json', 'utf8', (err, data) => {
  if (err) throw err;
  listaIntrebari = JSON.parse(data);
});


app.get('/chestionar', (req, res) => {
  // în fișierul views/chestionar.ejs este accesibilă variabila 'intrebari' careconține vectorul de întrebări
  res.render('chestionar', { intrebari: listaIntrebari, utilizator: req.session.utilizator });
});

app.post('/rezultat-chestionar', (req, res) => {
  const intrebari = req.body;
  console.log(intrebari);
  let nrRaspCorecte = 0;
  var raspunsuriDate = [];
  var raspunsuriCorecte = [];
  for (let i = 0; i < listaIntrebari.length; i++) {
    const intrebare = listaIntrebari[i];
    const raspunsCorect = intrebare.corect;
    raspunsuriCorecte.push(intrebare.variante[raspunsCorect]);
    const raspunsDat = intrebari[`raspuns${i}`];
    raspunsuriDate.push(raspunsDat);
    if (raspunsCorect == raspunsDat) {
      nrRaspCorecte++;
    }
  }
  res.render("rezultat-chestionar", { intrebari: listaIntrebari, nrRaspCorecte, raspunsuriDate, raspunsuriCorecte, utilizator: req.session.utilizator });
});

app.get('/autentificare', (req, res) => {
  const { mesajEroare } = req.cookies;
  if(!autentif){
    res.render('autentificare', { mesajEroare, utilizator: req.session.utilizator });
  }
  else{
    res.redirect('/');
  }
});
let rawUseri = fs.readFileSync('utilizatori.json');
const listaUtilizatori = JSON.parse(rawUseri);

var nrIncercari=0;
var autentif=0;
app.post('/verificare-autentificare', (req, res) => {
  const { utilizator, parola } = req.body;
  const ipAddress=req.ip;
  var utilizatorObiect = null;

  for (let i = 0; i < listaUtilizatori.length; i++) {
    if (listaUtilizatori[i].utilizator === utilizator && listaUtilizatori[i].parola === parola) {
      utilizatorObiect = listaUtilizatori[i];
      break;
    }
  }
  if (utilizatorObiect) {
    req.session.utilizator = {
      utilizator: utilizatorObiect.utilizator,
      nume: utilizatorObiect.nume,
      prenume: utilizatorObiect.prenume,
      rol: utilizatorObiect.rol
    };
    nrIncercari=0;
    autentif=1;
    res.clearCookie('mesajEroare');
    //Cookie
    res.cookie('utilizator', utilizator);
    res.redirect('/');
  } else {

    // Autentificare eșuată, incrementăm numărul de încercări nereușite pentru adresa IP și numele de utilizator
    nrIncercari++;
    if(nrIncercari >= 3){
      blockUser(ipAddress, nrIncercari);
    }
    res.clearCookie('utilizator');
    res.cookie('mesajEroare', 'Utilizator sau parolă incorectă.');
    res.redirect('/autentificare');
  }
});

app.get('/admin', (req, res) => {
  if (req.session.utilizator && req.session.utilizator.rol === 'ADMIN') {
    res.render('admin', { utilizator: req.session.utilizator });
  } else {
    res.redirect('/autentificare');
  }
});

app.post('/admin', function (req, res) {
  var numeProdus = req.body.prod;
  var pret = req.body.prett;

  const sql = "INSERT INTO produse (nume, pret) VALUES (?, ?)";
  const values = [numeProdus, pret];

  connection.query(sql, values, (error, result) => {
    if (error) {
      console.error('Eroare la adăugarea produsului în baza de date', error);
      res.status(500).send('A aparaut o eroare in timpul inserarii unui produs');
    } else {
      console.log('Produs adăugat cu succes în baza de date');
    }
  });
  
  res.redirect('/admin');
});

app.get('/deconectare', (req, res) => {
  autentif=0;
  res.clearCookie('utilizator');
  res.clearCookie('mesajEroare');
  req.session.destroy();
  res.redirect('/autentificare');

});

const connection = mysql.createConnection({
  host: '127.0.0.1',
  user: 'root', // înlocuiți cu utilizatorul dvs.
  password: 'admin' // înlocuiți cu parola dvs.
});
connection.connect(function (err) {
  if (err) throw err;
  console.log("Connected!");
});
connection.query("CREATE DATABASE IF NOT EXISTS cumparaturi", function (err, result) {
  if (err) throw err;
  console.log("Database created or already exists");
});
connection.query("USE cumparaturi", function (err) {
  if (err) throw err;
  console.log("Database selected");
});

var conn = false;
app.get('/creare-bd', (req, res) => {
  if (!conn) {
    connection.query("CREATE TABLE IF NOT EXISTS produse (id INT AUTO_INCREMENT PRIMARY KEY, nume VARCHAR(255) UNIQUE, pret DECIMAL(10,2))", function (err) {
      if (err) throw err;
      console.log("Table 'produse' created or already exists");
    });
    conn = true;
  }
  res.redirect('/');
});


app.get("/inserare-bd", (req, res) => {
  connection.query("USE cumparaturi", function (err) {
    if (err) throw err;
    console.log("Database selected");
    let sql = "INSERT INTO produse (nume, pret) VALUES (?, ?) ON DUPLICATE KEY UPDATE pret = ?";
    let values = [
      ['Balansoar Bologna', 1198],
      ['Hamac tip scaun', 129],
      ['Perdele pentru pavilion', 249],
      ['Casuta de gradina', 4999],
      ['Perna decorativa Naterial Spot', 39.90],
      ['Copertina retractabila, manuala, poliester', 594],
      ['Scaun gradina Moon, pliabil, textil, bej', 119],
      ['Gratar carbuni/lemne Ulisse', 1450],
      ['Piscina cu cadru metalic Bestway, 549 x 274 cm', 3299],
      ['Jardiniera flori', 10]
    ];
    values.forEach((element) => {
      connection.query(sql, [element[0], element[1], element[1]], function (err, result) {
        if (err) throw err;
      }
      )
    });
  });
  res.redirect("/");
});
function getProduse(callback) {
  const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'admin',
    database: 'cumparaturi'
  });

  connection.connect();

  connection.query('SELECT * FROM produse', (error, results) => {
    if (error) throw error;
    callback(results);
  });

  connection.end();
}



app.get("/adaugare_cos", (req, res) => {
  const idProdus = req.query.id;
  if (!req.session.cos) {
    req.session.cos = [];
  }
  // Verificăm dacă produsul există deja în coș
  let produsInCos = req.session.cos.find((produs) => produs.id === idProdus);
  if (produsInCos) {
    // Dacă produsul există, creștem cantitatea
    produsInCos.cantitate++;
    console.log("Produs in cos.");
  } else {
    // Dacă produsul nu există, îl adăugăm cu cantitatea 1
    req.session.cos.push({ id: idProdus, cantitate: 1 });
    console.log("Produs adaugat.");
  }
  res.redirect('/');
});


function getProduseDinCos(produseInCos, callback) {
  // Verificăm dacă avem ID-uri de produse în coș
  if (produseInCos.length === 0) {
    callback([]);
    return;
  }
  let placeholders = produseInCos.map(() => '?').join(',');
  let iduriProduse = produseInCos.map((produs) => produs.id);
  let sql = `SELECT * FROM produse WHERE id IN (${placeholders})`;
  connection.query(sql, iduriProduse, (error, results) => {
    if (error) {
      console.error('Eroare la interogarea bazei de date', error);
      callback([]);
      return;
    }

    let produse = results.map((produs) => {
      let produsInCos = produseInCos.find((p) => parseInt(p.id) === parseInt(produs.id));
      let total = produs.pret * produsInCos.cantitate;
      return { ...produs, cantitate: produsInCos.cantitate, total: total };
    });
    callback(produse);
  });
}


app.get("/vizualizare_cos", (req, res) => {
  const iduriProduse = req.session.cos || [];
  getProduseDinCos(iduriProduse, (produseCos) => {
    res.render('vizualizare-cos', { produseCos: produseCos, utilizator: req.session.utilizator });
  });
});

app.get('/stergere_cos', (req,res) =>{
  req.session.cos=[];
  res.redirect('/vizualizare_cos');
});



app.get('/', (req, res) => {
  //const {utilizator}=req.cookies;
  getProduse((produse) => {
    res.render('index', { utilizator: req.session.utilizator ? req.session.utilizator : null, produse });

  });
});
app.listen(port, () => console.log(`Serverul rulează la adresa http://localhost:6789`));