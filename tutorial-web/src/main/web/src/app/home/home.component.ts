import { Component, OnInit } from '@angular/core';
import { PlacesService } from '../shared/service/places.service';

@Component({
  templateUrl: './home.component.html',
  styleUrls: ['home.css']
})
export class HomeComponent implements OnInit {
  account: Account;
  places: any;
  randomItem: any;

  constructor(private placesService: PlacesService) { }

  ngOnInit() {
    this.fetchPlaces();
  }

  selectRandom() {
    this.placesService.loadPlacesList();
    this.fetchPlaces();
    this.getRandomArbitrary(0, this.places.size + 1);
    console.log('random number is', this.getRandomArbitrary(0, this.places.size + 1));
    this.randomItem = this.places[this.getRandomArbitrary(0, this.places.length + 1)];
  }

  fetchPlaces() {
    this.placesService.getPlaces().subscribe(res => {
      this.places = res;
      console.log('MMAAAAAAIN', res);
    });
  }
  getRandomArbitrary(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
  }
}
