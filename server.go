package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
)

func main() {
	http.HandleFunc("/echo", func(w http.ResponseWriter, r *http.Request) {
		var p any
		err := json.NewDecoder(r.Body).Decode(&p)
		if err != nil {
			if err.Error() == "EOF" {
				fmt.Fprint(w)
				return
			}
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		switch p.(type) {
		case map[string]any:
			jsonStr, err := json.Marshal(p)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			w.Header().Add("content-type", "application/json")
			fmt.Fprint(w, string(jsonStr))
		default:
			fmt.Fprint(w)
		}
	})

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		host, err := os.Hostname()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		fmt.Fprintf(w, "Hello World from %s from v3", host)
	})

	fmt.Println("Starting server at port 80")
	if err := http.ListenAndServe(":80", nil); err != nil {
		log.Fatal(err)
	}
}
