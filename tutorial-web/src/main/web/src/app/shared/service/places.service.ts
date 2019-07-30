import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {} from 'googlemaps';

@Injectable()
export class PlacesService {

  //data store and observable
  private _places: BehaviorSubject<any>;
  private dataStore: { todos: any } ;

  constructor() {
    this._places = <BehaviorSubject<any>>new BehaviorSubject([]);
    this.dataStore= { todos: [] };
  }

  getPlacesObservable(): any {
    return this._places.asObservable();
  }

  // loadPlacesList(): any {
  //   console.log('loading places');
  //   if (!this.map) {
  //     console.log('sry your map is not initialized');
  //   } else {
  //     console.log('laod places list');
  //     let map = new google.maps.Map(this.map, {
  //       center: this.pyrmont,
  //       zoom: 15
  //     });

  //     let request = {
  //       location: this.pyrmont,
  //       radius: 20000,
  //       query: 'кебаб'
  //     };

  //     let service = new google.maps.places.PlacesService(map);
  //     service.textSearch(request, (results, status) => {
  //       if (status == google.maps.places.PlacesServiceStatus.OK) {
  //         for (var i = 0; i < results.length; i++) {
  //           var place = results[i];
  //           this.dataStore.todos.push(place);
  //         }
  //         this._places.next(Object.assign({}, this.dataStore).todos);
  //       }
  //     });
  //   }
  // }
}
